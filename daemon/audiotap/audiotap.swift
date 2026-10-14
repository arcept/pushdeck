// audiotap: streams the Mac's system audio output (everything you hear) to stdout as mono float32 frames.
// Uses a Core Audio process tap (macOS 14.2+). It needs the "System Audio Recording" permission, which macOS asks for once.
// Usage: audiotap <fifo path>. Writes to that FIFO: 4 bytes sample rate (UInt32 LE), then frames of 1024 mono Float32 samples.
// It runs as its own app bundle (started with `open`) so macOS asks for audio permission in its name. Errors go to stderr.
import Foundation
import CoreAudio
import AudioToolbox

func fail(_ m: String, _ code: Int32 = 2) -> Never {
    FileHandle.standardError.write((m + "\n").data(using: .utf8)!)
    exit(code)
}

func prop<T>(_ obj: AudioObjectID, _ sel: AudioObjectPropertySelector, _ initial: T) -> T? {
    var addr = AudioObjectPropertyAddress(mSelector: sel, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
    var v = initial
    var size = UInt32(MemoryLayout<T>.size)
    return AudioObjectGetPropertyData(obj, &addr, 0, nil, &size, &v) == noErr ? v : nil
}

guard #available(macOS 14.2, *) else { fail("needs macOS 14.2 or newer", 3) }
guard CommandLine.arguments.count > 1, let out = fopen(CommandLine.arguments[1], "wb") else { fail("usage: audiotap <fifo path>", 1) }
setvbuf(out, nil, _IOFBF, 1 << 16)
signal(SIGPIPE, SIG_DFL)

let desc = CATapDescription(stereoGlobalTapButExcludeProcesses: [])
desc.name = "Push Deck"
desc.uuid = UUID()
desc.muteBehavior = .unmuted
var tap = AudioObjectID(kAudioObjectUnknown)
let st = AudioHardwareCreateProcessTap(desc, &tap)
guard st == noErr else { fail("could not create the audio tap (status \(st)); allow System Audio Recording in System Settings > Privacy & Security", 4) }

guard let outDev: AudioObjectID = prop(AudioObjectID(kAudioObjectSystemObject), kAudioHardwarePropertyDefaultOutputDevice, AudioObjectID(0)),
      let outUID: CFString = prop(outDev, kAudioDevicePropertyDeviceUID, "" as CFString) else { fail("no output device", 5) }
var asbd: AudioStreamBasicDescription = prop(tap, kAudioTapPropertyFormat, AudioStreamBasicDescription()) ?? AudioStreamBasicDescription()
let rate = UInt32(asbd.mSampleRate > 0 ? asbd.mSampleRate : 48000)

let aggDict: [String: Any] = [
    kAudioAggregateDeviceNameKey: "PushDeckTap",
    kAudioAggregateDeviceUIDKey: UUID().uuidString,
    kAudioAggregateDeviceMainSubDeviceKey: outUID as String,
    kAudioAggregateDeviceIsPrivateKey: true,
    kAudioAggregateDeviceIsStackedKey: false,
    kAudioAggregateDeviceTapAutoStartKey: true,
    kAudioAggregateDeviceSubDeviceListKey: [[kAudioSubDeviceUIDKey: outUID as String]],
    kAudioAggregateDeviceTapListKey: [[kAudioSubTapDriftCompensationKey: true, kAudioSubTapUIDKey: desc.uuid.uuidString]],
]
var agg = AudioObjectID(kAudioObjectUnknown)
let st2 = AudioHardwareCreateAggregateDevice(aggDict as CFDictionary, &agg)
guard st2 == noErr else { fail("could not create the aggregate device (status \(st2))", 6) }

var hdr = rate.littleEndian
fwrite(&hdr, 4, 1, out)
fflush(out)

let N = 1024
var acc = [Float](repeating: 0, count: N)
var fill = 0
let q = DispatchQueue(label: "audiotap", qos: .userInteractive)
var procID: AudioDeviceIOProcID?
let ps = AudioDeviceCreateIOProcIDWithBlock(&procID, agg, q) { _, inData, _, _, _ in
    let list = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: inData))
    guard list.count > 0 else { return }
    let first = list[0]
    let interleavedCh = Int(max(first.mNumberChannels, 1))
    let frames = list.count > 1 ? Int(first.mDataByteSize) / 4 : Int(first.mDataByteSize) / 4 / interleavedCh
    for i in 0..<frames {
        var s: Float = 0
        var n: Float = 0
        if list.count > 1 {
            for b in list { if let p = b.mData?.assumingMemoryBound(to: Float.self) { s += p[i]; n += 1 } }
        } else if let p = first.mData?.assumingMemoryBound(to: Float.self) {
            for c in 0..<interleavedCh { s += p[i * interleavedCh + c]; n += 1 }
        }
        acc[fill] = n > 0 ? s / n : 0
        fill += 1
        if fill == N {
            acc.withUnsafeBufferPointer { _ = fwrite($0.baseAddress, 4, N, out) }
            fflush(out)
            fill = 0
        }
    }
}
guard ps == noErr, let pid = procID else { fail("could not start the audio reader (status \(ps))", 7) }
guard AudioDeviceStart(agg, pid) == noErr else { fail("could not start capturing", 8) }
signal(SIGTERM) { _ in exit(0) }
dispatchMain()
