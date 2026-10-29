import { createWorldModel } from './world-presence';
import type { DiscoveryRoom } from './discovery-types';

// Imperative engine state shared with Phaser; React only renders UI snapshots.
export class WorldBridge {
  readonly model = createWorldModel();
  desks: (DiscoveryRoom | null)[] = Array(8).fill(null);
  constructor(public nickname: string, public color: string, public interact: (slot: number) => void) { this.model.enabled = false; }
  setEnabled(value: boolean) { this.model.enabled = value; }
  setDesks(value: (DiscoveryRoom | null)[]) { this.desks = value; }
}
