import type { RankInput, SetupCandidate } from '../domain/types.js';
import { defaultRankingModel, type RankingModel } from './rankingModel.js';

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

const scoreCandidate = (candidate: SetupCandidate, model: RankingModel): number => {
  const oneMinuteSoftBoost = (candidate.oneMinuteConfidence - 0.5) * model.confidenceWeight;
  const rawAiScore =
    typeof candidate.metadata.aiContextScore === 'number' ? candidate.metadata.aiContextScore : 0;
  const aiMetadataScore = rawAiScore * model.aiContextWeight;
  const setupAdjustment = model.setupAdjustments[candidate.setupType] ?? 0;
  const symbolAdjustment = model.symbolAdjustments[candidate.symbol] ?? 0;

  return clamp(
    candidate.baseScore +
      model.bias +
      setupAdjustment +
      symbolAdjustment +
      oneMinuteSoftBoost +
      aiMetadataScore,
    0,
    100
  );
};

// Rule-first pipeline: learned model only reorders candidates that already passed deterministic filters.
export const rankCandidates = (
  { candidates }: RankInput,
  model: RankingModel = defaultRankingModel()
): SetupCandidate[] => {
  return candidates
    .filter((candidate) => candidate.eligibility.passed)
    .map((candidate) => {
      const finalScore = scoreCandidate(candidate, model);

      return {
        ...candidate,
        finalScore
      };
    })
    .sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0));
};
