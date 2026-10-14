import math
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
def hexc(h): h=h.lstrip("#"); return tuple(int(h[i:i+2],16) for i in (0,2,4))
def mix(a,b,t): return tuple(int(a[i]+(b[i]-a[i])*max(0,min(1,t))) for i in range(3))
class Canvas:
    def __init__(s,w,h,bg=(10,10,14),ss=6,mode="RGB"):
        s.w,s.h,s.SS,s.mode=w,h,ss,mode; s.im=Image.new(mode,(w*ss,h*ss),bg)
    def _mask(s,fn):
        m=Image.new("L",s.im.size,0); fn(ImageDraw.Draw(m)); return m
    def fill(s,fn,c0,c1=None,alpha=1.0,box=None):
        m=s._mask(fn)
        if alpha<1: m=m.point(lambda v:int(v*alpha))
        bb=m.getbbox()
        if not bb: return
        if c1 is None: src=Image.new("RGB",s.im.size,c0)
        else:
            y0,y1=bb[1],bb[3]; ys=np.clip((np.arange(s.im.size[1])-y0)/max(1,y1-y0),0,1)[:,None]
            a=np.array(c0,float)[None,None,:]; b=np.array(c1,float)[None,None,:]
            arr=(a+(b-a)*ys[:,:,None]); arr=np.broadcast_to(arr,(s.im.size[1],s.im.size[0],3)).astype(np.uint8)
            src=Image.fromarray(arr)
        s.im.paste(src,mask=m)
    def hgrad(s,fn,stops,alpha=1.0,xr=None):
        m=s._mask(fn)
        if alpha<1: m=m.point(lambda v:int(v*alpha))
        bb=m.getbbox()
        if not bb: return
        x0,x1=(xr[0]*s.SS,xr[1]*s.SS) if xr else (bb[0],bb[2])
        xs=np.clip((np.arange(s.im.size[0])-x0)/max(1,x1-x0),0,1)
        arr=np.zeros((1,s.im.size[0],3))
        for ch in range(3):
            arr[0,:,ch]=np.interp(xs,[p for p,_ in stops],[c[ch] for _,c in stops])
        arr=np.broadcast_to(arr,(s.im.size[1],s.im.size[0],3)).astype(np.uint8)
        s.im.paste(Image.fromarray(arr),mask=m)
    def e(s,cx,cy,rx,ry,c0,c1=None,alpha=1.0):
        s.fill(lambda d:d.ellipse([(cx-rx)*s.SS,(cy-ry)*s.SS,(cx+rx)*s.SS,(cy+ry)*s.SS],fill=255),c0,c1,alpha)
    def r(s,x0,y0,x1,y1,rad,c0,c1=None,alpha=1.0):
        s.fill(lambda d:d.rounded_rectangle([x0*s.SS,y0*s.SS,x1*s.SS,y1*s.SS],radius=rad*s.SS,fill=255),c0,c1,alpha)
    def poly(s,pts,c0,c1=None,alpha=1.0):
        s.fill(lambda d:d.polygon([(x*s.SS,y*s.SS) for x,y in pts],fill=255),c0,c1,alpha)
    def line(s,pts,w,c,alpha=1.0):
        s.fill(lambda d:d.line([(x*s.SS,y*s.SS) for x,y in pts],fill=255,width=int(w*s.SS),joint="curve"),c,None,alpha)
    def arc(s,cx,cy,rx,ry,a0,a1,w,c,alpha=1.0):
        s.fill(lambda d:d.arc([(cx-rx)*s.SS,(cy-ry)*s.SS,(cx+rx)*s.SS,(cy+ry)*s.SS],a0,a1,fill=255,width=int(w*s.SS)),c,None,alpha)
    def glow(s,fn,c,rad=6,strength=0.8):
        m=s._mask(fn).filter(ImageFilter.GaussianBlur(rad*s.SS/2))
        m=m.point(lambda v:int(min(255,v*strength*2)))
        s.im.paste(Image.new("RGB",s.im.size,c),mask=m)
    def out(s,scale=1):
        im=s.im.resize((s.w*scale,s.h*scale),Image.LANCZOS) if scale!=1 else s.im.resize((s.w,s.h),Image.LANCZOS)
        return im
