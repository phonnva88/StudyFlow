import Phaser from 'phaser';
import { canStand, DESKS, OBSTACLES, RECEPTION, WORLD_HEIGHT, WORLD_WIDTH } from '@/lib/world';
import type { WorldBridge } from '@/lib/world-bridge';
export function createLibrary(parent: HTMLElement, bridge: WorldBridge) {
  class Library extends Phaser.Scene {
    private keys!: Record<string, Phaser.Input.Keyboard.Key>;
    private me!: Phaser.GameObjects.Container;
    private remotes = new Map<string, Phaser.GameObjects.Container>();
    private labels: Phaser.GameObjects.Text[] = [];
    private deskSnapshot: WorldBridge['desks'] | null = null;
    private prompt!: Phaser.GameObjects.Text;
    create() {
      const g = this.add.graphics();
      // Original procedural pixel art; no external images or font requests.
      g.fillStyle(0x302e31).fillRect(0, 0, 640, 480);
      for (let y = 80; y < 464; y += 16) for (let x = 16; x < 624; x += 32) {
        g.fillStyle((x / 32 + y / 16) % 2 ? 0x9e7859 : 0xa98160).fillRect(x, y, 31, 15);
        g.fillStyle(0x8b684d, 0.4).fillRect(x + 5, y + 10, 18, 1);
      }
      g.fillStyle(0x52635b).fillRect(16, 16, 608, 60);
      g.fillStyle(0x35473f).fillRect(16, 72, 608, 8);
      g.fillStyle(0xcead7a).fillRect(16, 76, 608, 3);
      g.fillStyle(0x777b70).fillRect(16, 80, 4, 384).fillRect(620, 80, 4, 384);
      g.fillStyle(0x516b65).fillRoundedRect(270, 108, 100, 300, 12);
      g.lineStyle(2, 0xbaaa7a).strokeRoundedRect(277, 115, 86, 286, 9);
      for (const x of [208, 328, 448]) {
        g.fillStyle(0x473f35).fillRect(x, 32, 88, 40);
        for (let row = 0; row < 2; row++) for (let col = 0; col < 11; col++) {
          g.fillStyle([0xa57160, 0xccb47e, 0x879786, 0x788a99][(row + col) % 4]).fillRect(x + 4 + col * 7, 36 + row * 16, 5, 12);
        }
        g.fillStyle(0xc49b69).fillRect(x, 50, 88, 3).fillRect(x, 68, 88, 4);
      }
      for (const p of OBSTACLES.slice(-4)) {
        g.fillStyle(0x574534, 0.35).fillEllipse(p.x + 10, p.y + 25, 30, 12);
        g.fillStyle(0xc08b67).fillRect(p.x + 2, p.y + 10, 16, 14);
        g.fillStyle(0x4b7157).fillRect(p.x - 4, p.y - 5, 26, 13);
        g.fillStyle(0x7b9b66).fillRect(p.x + 5, p.y - 13, 10, 25);
      }
      g.fillStyle(0x493d34).fillRect(48, 66, 88, 42);
      g.fillStyle(0xc79967).fillRect(48, 64, 88, 28);
      g.fillStyle(0xebd8a4).fillRect(63, 69, 18, 12);
      g.fillStyle(0x68866b).fillRect(109, 61, 12, 17);
      this.add.text(92, 116, 'RECEPTION', {fontFamily: 'monospace', fontSize: '9px', color: '#fff1cc'}).setOrigin(0.5);
      this.add.zone(RECEPTION.x, RECEPTION.y, 96, 64).setInteractive({useHandCursor: true}).on('pointerdown', () => bridge.interact(-1));
      DESKS.forEach(({x, y}, i) => {
        g.fillStyle(0x3f302c, 0.3).fillEllipse(x + 3, y + 31, 86, 24);
        g.fillStyle(0x483d32).fillRect(x - 33, y - 12, 6, 46).fillRect(x + 27, y - 12, 6, 46);
        g.fillStyle(0x74503c).fillRect(x - 38, y - 18, 76, 40);
        g.fillStyle(0xd2a573).fillRect(x - 36, y - 18, 72, 31);
        g.fillStyle(0xe8d6ad).fillRect(x - 21, y - 12, 18, 15);
        g.lineStyle(1, 0x988b6f).lineBetween(x - 12, y - 11, x - 12, y + 2);
        g.fillStyle(0x6b8274).fillRect(x + 12, y - 11, 13, 10);
        g.fillStyle(0x607e68).fillRect(x - 11, y + 22, 22, 13);
        g.fillStyle(0xb58e64).fillRect(x - 13, y + 22, 4, 16).fillRect(x + 9, y + 22, 4, 16);
        this.add.zone(x, y, 82, 70).setInteractive({useHandCursor: true}).on('pointerdown', () => bridge.interact(i));
        this.labels.push(this.add.text(x, y - 48, '', {fontFamily: 'monospace', fontSize: '10px', align: 'center', backgroundColor: '#302e31', padding: {x: 4, y: 3}}).setOrigin(0.5));
      });
      g.fillStyle(0x4c625c).fillRect(280, 423, 80, 41);
      g.lineStyle(2, 0xc9b581).strokeRect(285, 427, 70, 33);
      this.add.text(320, 467, '↑ ENTRANCE', {fontFamily: 'monospace', fontSize: '9px', color: '#f1d9ad'}).setOrigin(0.5);
      this.add.text(36, 24, 'THE STUDY LIBRARY', {fontFamily: 'monospace', fontSize: '12px', color: '#f1d9ad'});
      this.me = this.avatar(bridge.nickname, bridge.color);
      this.prompt = this.add.text(320, 8, '', {fontFamily: 'monospace', fontSize: '11px', color: '#fff4cf', backgroundColor: '#302e31', padding: {x: 8, y: 5}}).setOrigin(0.5, 0).setDepth(1000);
      this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E', false) as typeof this.keys;
      this.input.keyboard!.on('keydown-E', (event: KeyboardEvent) => {
        if (event.repeat || document.activeElement !== this.game.canvas || !bridge.model.enabled || document.hidden) return;
        const nearby = this.nearbyDesk();
        if (nearby !== -2) bridge.interact(nearby);
      });
      const canvas = this.game.canvas;
      canvas.tabIndex = 0;
      canvas.setAttribute('aria-label', 'Virtual library. Use WASD or arrow keys to walk, E to interact. Room buttons are also available below.');
      canvas.style.width = '100%'; canvas.style.height = '100%'; canvas.style.objectFit = 'contain';
      const focus = () => canvas.focus({preventScroll: true});
      const prevent = (event: KeyboardEvent) => { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) event.preventDefault(); };
      const blur = () => { this.input.keyboard?.resetKeys(); bridge.model.local.animation = 'idle'; };
      canvas.addEventListener('pointerdown', focus);
      canvas.addEventListener('keydown', prevent);
      canvas.addEventListener('blur', blur);
      this.events.once('shutdown', () => { canvas.removeEventListener('pointerdown', focus); canvas.removeEventListener('keydown', prevent); canvas.removeEventListener('blur', blur); });
    }
    avatar(name: string, color: string) {
      const g = this.add.graphics();
      g.fillStyle(0x292726, 0.4).fillEllipse(0, 5, 20, 9);
      g.fillStyle(0x413d45).fillRect(-6, -1, 5, 7).fillRect(2, -1, 5, 7);
      g.fillStyle(Phaser.Display.Color.HexStringToColor(color).color).fillRect(-8, -14, 16, 15);
      g.fillStyle(0xe1b58e).fillRect(-6, -24, 12, 12);
      g.fillStyle(0x4b3c38).fillRect(-7, -27, 14, 6).fillRect(-7, -23, 3, 7);
      g.fillStyle(0x352f31).fillRect(2, -19, 2, 2);
      const label = this.add.text(0, -40, name, {fontFamily: 'monospace', fontSize: '10px', color: '#fff3d9', backgroundColor: '#302e31', padding: {x: 3, y: 2}}).setOrigin(0.5);
      return this.add.container(0, 0, [g, label]);
    }
    nearbyDesk() {
      const local = bridge.model.local;
      let nearby = -2;
      [...DESKS, RECEPTION].forEach((p, i) => { if (Math.hypot(local.x - p.x, local.y - p.y) < 74) nearby = i === DESKS.length ? -1 : i; });
      return nearby;
    }
    update(time: number, delta: number) {
      const local = bridge.model.local;
      const focused = document.activeElement === this.game.canvas && bridge.model.enabled && !document.hidden;
      const k = this.keys;
      let dx = 0, dy = 0;
      if (focused) { dx = Number(k.D.isDown || k.RIGHT.isDown) - Number(k.A.isDown || k.LEFT.isDown); dy = Number(k.S.isDown || k.DOWN.isDown) - Number(k.W.isDown || k.UP.isDown); }
      local.animation = dx || dy ? 'walking' : 'idle';
      if (dx || dy) {
        local.direction = Math.abs(dx) >= Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up';
        const step = 118 * Math.min(delta, 40) / 1000 / Math.hypot(dx, dy);
        if (canStand(local.x + dx * step, local.y)) local.x += dx * step;
        if (canStand(local.x, local.y + dy * step)) local.y += dy * step;
      }
      this.me.setPosition(local.x, local.y + (local.animation === 'walking' ? Math.sin(time / 80) : 0)).setDepth(local.y + 100);
      const nearby = this.nearbyDesk();
      this.prompt.setText(nearby === -2 ? '' : nearby === -1 ? 'E · Create a study room' : 'E · Visit this study desk');
      for (const [id, player] of bridge.model.peers) {
        let avatar = this.remotes.get(id);
        if (!avatar) { avatar = this.avatar(player.nickname, player.avatarColor).setPosition(player.x, player.y); this.remotes.set(id, avatar); }
        const blend = 1 - Math.exp(-Math.min(delta, 100) / 70);
        avatar.x += (player.x - avatar.x) * blend; avatar.y += (player.y - avatar.y) * blend;
        avatar.setDepth(avatar.y + 100);
      }
      for (const [id, avatar] of this.remotes) if (!bridge.model.peers.has(id)) { avatar.destroy(); this.remotes.delete(id); }
      if (this.deskSnapshot !== bridge.desks) {
        this.deskSnapshot = bridge.desks;
        this.labels.forEach((label, i) => {
          const room = bridge.desks[i];
          label.setText(room ? `${room.title.length > 17 ? room.title.slice(0, 16) + '…' : room.title}\n${room.participantCount}/${room.maxParticipants} · ${room.status}` : 'Open desk').setColor(room?.status === 'FULL' ? '#e4ad79' : room ? '#b7ddc3' : '#c0b39e');
        });
      }
    }
  }
  return new Phaser.Game({type: Phaser.AUTO, parent, width: WORLD_WIDTH, height: WORLD_HEIGHT, backgroundColor: '#302e31', pixelArt: true, banner: false, scene: Library, audio: {noAudio: true}, scale: {mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH}});
}
