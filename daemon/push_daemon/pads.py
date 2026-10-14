"""Attention animations on the 8 x 8 pads, shared by the question alert and the usage-limit alert."""
import math


def ripple(push, t, inner, outer, period=1.3):
    """Rings of colour spreading from the middle of the pads to the edges, again and again. inner/outer: the (r, g, b) at the middle and at the edge."""
    ring = (t % period) / period * 6.4
    for r in range(8):
        for c in range(8):
            d = math.hypot(r - 3.5, c - 3.5)
            k = max(0.0, 1 - abs(d - ring) / 1.3)
            k = max(k * (0.55 + 0.45 * (1 - d / 6)), 0.05)     # the rings fade a little as they spread; the pads never go fully dark
            u = min(1.0, d / 5.0)
            push.set_led(f"pad-{r}-{c}", tuple(int((inner[i] + (outer[i] - inner[i]) * u) * k) for i in range(3)))
