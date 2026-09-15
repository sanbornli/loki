import type { RealtimeRoomRenderStates } from "./realtime-room.js";

/**
 * Selectors a game supplies so createEntityCompositor/createLocalPrediction
 * can plumb per-entity streams without Loki knowing what an "entity" is.
 * Loki's State is opaque JSON; these selectors are the only place that
 * knows how a particular game's State is shaped.
 */
export type EntitySelectors<State, EntityState> = {
  /** Every entity id present in a given full State, used to enumerate what to compose each frame. */
  listEntityIds(state: State): string[];
  /** Reads one entity's state out of a full State. Returning undefined skips that entity for this source. */
  getEntity(state: State, entityId: string): EntityState | undefined;
  /** Returns a full State equal to `into` but with `entityId` set to `entity`. Must not mutate `into`. */
  setEntity(into: State, entityId: string, entity: EntityState): State;
  /** True if `entityId` is the local player's own entity. */
  isLocalEntity(entityId: string): boolean;
};

/**
 * Builds a `composeRenderState` callback (see RealtimeRoomOptions) that
 * renders the local entity from corrected prediction and every other
 * entity from authoritative interpolation, without the game hand-writing
 * per-entity merge logic. Falls back through
 * `interpolated ?? latestAuthoritative ?? correctedPredicted ?? predicted`
 * for the base State shape (so member lists/scores/etc. carried outside
 * per-entity fields still come from the most authoritative source
 * available), then overlays each entity from whichever stream is
 * appropriate for it.
 *
 * This is purely a convenience over getRenderStates(): a game can always
 * hand-write the equivalent composeRenderState itself, and Loki still has
 * no built-in concept of "entity", "position", or "heading" — the game's
 * selectors are the only place that interprets its own State shape.
 */
export function createEntityCompositor<State, EntityState>(
  selectors: EntitySelectors<State, EntityState>,
): (states: RealtimeRoomRenderStates<State>) => State | undefined {
  const { listEntityIds, getEntity, setEntity, isLocalEntity } = selectors;
  return (states: RealtimeRoomRenderStates<State>): State | undefined => {
    const base = states.interpolated ?? states.latestAuthoritative ?? states.correctedPredicted ?? states.predicted;
    if (base === undefined) return undefined;
    const localSource = states.correctedPredicted ?? states.predicted;
    const remoteSource = states.interpolated ?? states.latestAuthoritative;
    let result: State = base;
    for (const entityId of listEntityIds(base)) {
      const source = isLocalEntity(entityId) ? localSource : remoteSource;
      if (source === undefined) continue;
      const entity = getEntity(source, entityId);
      if (entity === undefined) continue;
      result = setEntity(result, entityId, entity);
    }
    return result;
  };
}

/**
 * Selectors a game supplies so createLocalPrediction can predict only the
 * local player's own entity instead of the game accidentally predicting
 * the whole world (a common mistake when the game's own predict() closes
 * over the full State without restricting itself to one entity).
 */
export type LocalPredictionSelectors<State, EntityState, Input> = {
  /** The local player's entity id for a given State, or undefined if there isn't one yet (e.g. before spawn). */
  localEntityId(state: State): string | undefined;
  /** Reads the local entity's state out of a full State. */
  getLocalEntity(state: State, entityId: string): EntityState | undefined;
  /** Simulates one prediction step for the local entity only. Must not mutate `entity`. */
  predictLocal(entity: EntityState, input: Input, dtSeconds: number): EntityState;
  /** Returns a full State equal to `state` but with the local entity replaced by `entity`. Must not mutate `state`. */
  replaceLocalEntity(state: State, entityId: string, entity: EntityState): State;
};

/**
 * Builds a `predict` callback (see RealtimeRoomOptions) that steps only the
 * local player's entity, leaving the rest of State untouched. Use this
 * instead of hand-writing predict() when the game's step function would
 * otherwise need explicit guarding to avoid predicting remote entities too.
 */
export function createLocalPrediction<State, EntityState, Input>(
  selectors: LocalPredictionSelectors<State, EntityState, Input>,
): (state: State, input: Input, dtSeconds: number) => State {
  const { localEntityId, getLocalEntity, predictLocal, replaceLocalEntity } = selectors;
  return (state: State, input: Input, dtSeconds: number): State => {
    const entityId = localEntityId(state);
    if (entityId === undefined) return state;
    const entity = getLocalEntity(state, entityId);
    if (entity === undefined) return state;
    const predicted = predictLocal(entity, input, dtSeconds);
    return replaceLocalEntity(state, entityId, predicted);
  };
}
