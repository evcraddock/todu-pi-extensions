import type { ActorSummary } from "../domain/actor";

export interface CreateActorInput {
  id: string;
  displayName: string;
}

export interface RenameActorInput {
  actorId: string;
  displayName: string;
}

export interface ActorService {
  listActors(): Promise<ActorSummary[]>;
  createActor(input: CreateActorInput): Promise<ActorSummary>;
  renameActor(input: RenameActorInput): Promise<ActorSummary>;
  archiveActor(actorId: string): Promise<ActorSummary>;
  unarchiveActor(actorId: string): Promise<ActorSummary>;
}
