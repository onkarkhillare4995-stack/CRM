"""Timezone-safe day boundaries for 'today' metrics."""
from datetime import datetime, timezone, timedelta
try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None


def day_bounds(tz_name: str = "UTC", ref: datetime | None = None):
    """Return (start, end) UTC datetimes for the local calendar day in tz_name."""
    tz = timezone.utc
    if ZoneInfo and tz_name and tz_name != "UTC":
        try:
            tz = ZoneInfo(tz_name)
        except Exception:
            tz = timezone.utc
    now_local = (ref or datetime.now(timezone.utc)).astimezone(tz)
    start_local = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
    end_local = start_local + timedelta(days=1)
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)


def parse_range(tz_name, date_from, date_to):
    if date_from or date_to:
        start = datetime.fromisoformat(date_from) if date_from else datetime(1970, 1, 1, tzinfo=timezone.utc)
        end = datetime.fromisoformat(date_to) if date_to else datetime.now(timezone.utc) + timedelta(days=1)
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        return start, end
    return day_bounds(tz_name)
