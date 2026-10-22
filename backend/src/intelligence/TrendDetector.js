/**
 * Universal Trend Detector
 * Computes deterministic mathematical trends across metric observation series.
 * Output States: INCREASING, DECREASING, STABLE, VOLATILE, INSUFFICIENT_DATA
 * Purely domain-agnostic.
 */

const TREND_STATES = Object.freeze({
    INCREASING: 'INCREASING',
    DECREASING: 'DECREASING',
    STABLE: 'STABLE',
    VOLATILE: 'VOLATILE',
    INSUFFICIENT_DATA: 'INSUFFICIENT_DATA'
});

class TrendDetector {

    /**
     * Detect trend direction from a series of numeric values or data objects.
     */
    static detectTrend(series = [], options = {}) {
        const thresholdPercent = options.thresholdPercent !== undefined ? Number(options.thresholdPercent) : 5;

        const numbers = series
            .map(item => (typeof item === 'object' && item !== null ? Number(item.value) : Number(item)))
            .filter(val => !isNaN(val) && val !== null && val !== undefined);

        if (numbers.length < 2) {
            return {
                state: TREND_STATES.INSUFFICIENT_DATA,
                firstValue: numbers.length === 1 ? numbers[0] : null,
                lastValue: numbers.length === 1 ? numbers[0] : null,
                changeAmount: 0,
                changePercent: 0,
                sampleCount: numbers.length
            };
        }

        const firstValue = numbers[0];
        const lastValue = numbers[numbers.length - 1];
        const changeAmount = lastValue - firstValue;

        let changePercent = 0;
        if (firstValue !== 0) {
            changePercent = Number(((changeAmount / Math.abs(firstValue)) * 100).toFixed(2));
        } else if (lastValue !== 0) {
            changePercent = lastValue > 0 ? 100 : -100;
        }

        // Check for volatility (significant direction switches exceeding threshold)
        let directionSwitches = 0;
        const noiseMargin = Math.max(1, (thresholdPercent / 2));
        for (let i = 1; i < numbers.length - 1; i++) {
            const prevDiff = numbers[i] - numbers[i - 1];
            const nextDiff = numbers[i + 1] - numbers[i];
            const isPrevSig = Math.abs(prevDiff) > noiseMargin;
            const isNextSig = Math.abs(nextDiff) > noiseMargin;
            if (isPrevSig && isNextSig && ((prevDiff > 0 && nextDiff < 0) || (prevDiff < 0 && nextDiff > 0))) {
                directionSwitches++;
            }
        }

        const volatilityRatio = directionSwitches / (numbers.length - 1);
        if (numbers.length >= 4 && volatilityRatio > 0.6) {
            return {
                state: TREND_STATES.VOLATILE,
                firstValue,
                lastValue,
                changeAmount,
                changePercent,
                sampleCount: numbers.length
            };
        }

        let state = TREND_STATES.STABLE;
        if (changePercent > thresholdPercent) {
            state = TREND_STATES.INCREASING;
        } else if (changePercent < -thresholdPercent) {
            state = TREND_STATES.DECREASING;
        }

        return {
            state,
            firstValue,
            lastValue,
            changeAmount,
            changePercent,
            sampleCount: numbers.length
        };
    }
}

module.exports = {
    TREND_STATES,
    TrendDetector
};
