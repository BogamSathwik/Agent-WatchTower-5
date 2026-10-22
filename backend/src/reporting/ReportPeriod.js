/**
 * Universal Report Period Utility
 * Utility for parsing and managing reporting windows (5m, 1h, 24h, 7d, 30d, custom).
 * Purely domain-agnostic.
 */

const PERIOD_DURATIONS_MS = Object.freeze({
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000
});

class ReportPeriod {
    constructor(windowString = '24h', customStart = null, customEnd = null) {
        this.window = String(windowString).toLowerCase();
        const now = Date.now();

        if (this.window === 'custom' && customStart && customEnd) {
            this.startMs = new Date(customStart).getTime();
            this.endMs = new Date(customEnd).getTime();
            this.durationMs = Math.max(0, this.endMs - this.startMs);
        } else {
            this.durationMs = PERIOD_DURATIONS_MS[this.window] || PERIOD_DURATIONS_MS['24h'];
            this.endMs = now;
            this.startMs = now - this.durationMs;
        }

        // Calculate previous period for comparison (T_current - durationMs)
        this.previousEndMs = this.startMs;
        this.previousStartMs = this.startMs - this.durationMs;
    }

    get currentRange() {
        return {
            window: this.window,
            startISO: new Date(this.startMs).toISOString(),
            endISO: new Date(this.endMs).toISOString(),
            durationMs: this.durationMs
        };
    }

    get previousRange() {
        return {
            window: this.window,
            startISO: new Date(this.previousStartMs).toISOString(),
            endISO: new Date(this.previousEndMs).toISOString(),
            durationMs: this.durationMs
        };
    }

    static parseWindow(windowStr) {
        return new ReportPeriod(windowStr);
    }
}

module.exports = {
    ReportPeriod,
    PERIOD_DURATIONS_MS
};
