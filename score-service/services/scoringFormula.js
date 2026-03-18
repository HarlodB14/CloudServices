const DEFAULT_SIMILARITY_WEIGHT = Number(process.env.SIMILARITY_WEIGHT || 0.7);
const DEFAULT_TIMING_WEIGHT = Number(process.env.TIMING_WEIGHT || 0.3);

function clamp(min, value, max) {
    return Math.max(min, Math.min(max, value));
}

function calculateTimingScore(targetCreatedAt, targetDeadline, submittedAt) {
    const createdAt = new Date(targetCreatedAt).getTime();
    const deadline = new Date(targetDeadline).getTime();
    const submission = new Date(submittedAt).getTime();

    if (!Number.isFinite(createdAt) || !Number.isFinite(deadline) || !Number.isFinite(submission) || deadline <= createdAt) {
        return {
            timingScore: 0,
            secondsFromStart: 0,
            totalWindowSeconds: 0,
            timeSinceDeadline: 0
        };
    }

    const totalWindowSeconds = Math.max(1, (deadline - createdAt) / 1000);
    const secondsFromStart = (submission - createdAt) / 1000;
    const progress = clamp(0, secondsFromStart / totalWindowSeconds, 1);

    const timingScore = Math.round((1 - progress) * 100);

    return {
        timingScore,
        secondsFromStart: Math.round(secondsFromStart),
        totalWindowSeconds: Math.round(totalWindowSeconds),
        timeSinceDeadline: Math.round((submission - deadline) / 1000)
    };
}

function calculateFinalScore(similarity, timingScore, similarityWeight = DEFAULT_SIMILARITY_WEIGHT, timingWeight = DEFAULT_TIMING_WEIGHT) {
    const normalizedSimilarity = clamp(0, Number(similarity) || 0, 100);
    const normalizedTiming = clamp(0, Number(timingScore) || 0, 100);

    const totalWeight = similarityWeight + timingWeight || 1;
    const sWeight = similarityWeight / totalWeight;
    const tWeight = timingWeight / totalWeight;

    const finalScore = Math.round((normalizedSimilarity * sWeight) + (normalizedTiming * tWeight));

    return {
        finalScore,
        similarityWeight: sWeight,
        timingWeight: tWeight,
        formula: `round((${normalizedSimilarity} * ${sWeight.toFixed(2)}) + (${normalizedTiming} * ${tWeight.toFixed(2)}))`
    };
}

module.exports = {
    calculateTimingScore,
    calculateFinalScore
};