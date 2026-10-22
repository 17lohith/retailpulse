"""Shared helpers for Hadoop Streaming jobs (stdlib only)."""
import sys, json, re, collections

STOP = set("""a about above after again all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its just me more most my no nor not now of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up us very was we were what when where which while who whom why will with would you your yours
 br amp quot didn doesn don isn wasn weren won wouldn couldn shouldn aren hasn haven hadn ive im youve thats""".split())
TOKEN = re.compile(r"[a-z]{3,}")


class Counters:
    """Aggregate Hadoop counters locally and flush once (cheap)."""
    def __init__(self, group): self.g, self.c = group, collections.Counter()
    def inc(self, name, n=1): self.c[name] += n
    def flush(self):
        for k, v in self.c.items(): sys.stderr.write(f"reporter:counter:{self.g},{k},{v}\n")


def price_band(p):
    if p is None: return "no_price"
    return "<5" if p < 5 else "5-10" if p < 10 else "10-20" if p < 20 else "20-50" if p < 50 else "50+"


def parse_price(v):
    if isinstance(v, (int, float)): return float(v) if v >= 0 else None
    if isinstance(v, str):
        m = re.search(r"\d+(?:\.\d+)?", v.replace(",", ""))
        return float(m.group()) if m else None
    return None


def month_of(ts_ms):
    import datetime
    return datetime.datetime.utcfromtimestamp(ts_ms / 1000).strftime("%Y-%m")
