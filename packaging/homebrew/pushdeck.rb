# Homebrew cask for Push Deck. It lives in the tap repository (arcept/homebrew-tap, file Casks/pushdeck.rb);
# this copy is the template. On each release, set `version` and `sha256` (the number inside PushDeck-<version>-arm64.dmg.sha256).
cask "pushdeck" do
  version "0.1.0"
  sha256 "REPLACE_WITH_SHA256_OF_THE_DMG"

  url "https://github.com/arcept/pushdeck/releases/download/v#{version}/PushDeck-#{version}-arm64.dmg"
  name "Push Deck"
  desc "Use an Ableton Push 2 as a per-app controller and live display for your Mac"
  homepage "https://github.com/arcept/pushdeck"

  depends_on arch: :arm64
  depends_on macos: ">= :ventura"

  app "Push Deck.app"

  zap trash: [
    "~/Library/Application Support/Push Deck",
    "~/Library/Logs/Push Deck.log",
  ]

  caveats <<~EOS
    Push Deck is signed ad hoc, not with an Apple Developer ID. If macOS says it cannot verify the app,
    right-click Push Deck in Applications, choose Open, then Open again (once).
  EOS
end
