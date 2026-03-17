import type { RankingModel } from './rankingModel.js';

export class RankingModelStore {
  constructor(private current: RankingModel) {}

  get(): RankingModel {
    return this.current;
  }

  set(next: RankingModel): void {
    this.current = next;
  }
}
