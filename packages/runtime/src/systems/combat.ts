import Phaser from 'phaser';
import type { SpawnedEntity } from '../world/spawnEntity.js';

const DIR = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as const;
const SWING_MS = 140;
const ATTACK_COOLDOWN_MS = 320;
const KNOCKBACK_MS = 140;
const KNOCKBACK_SPEED = 220;
const PLAYER_INVULNERABLE_MS = 700;

export interface CombatHooks {
  onPlayerHurt(player: SpawnedEntity): void;
  onDefeated(e: SpawnedEntity): void;
  onPlayerDefeated(player: SpawnedEntity): void;
}

/** Player swings, enemies bump. Both resolve through `hurt`, which handles knockback, flash and defeat. */
export class CombatSystem {
  private nextSwingAt = 0;

  constructor(private scene: Phaser.Scene, private hooks: CombatHooks) {}

  /** Returns the hitbox in world space in front of the player, or null when on cooldown. */
  swing(player: SpawnedEntity, enemies: SpawnedEntity[], now: number, tileSize: number): boolean {
    const body = player.sprite?.body as Phaser.Physics.Arcade.Body | undefined;
    if (!body || now < this.nextSwingAt || player.defeated) return false;
    this.nextSwingAt = now + ATTACK_COOLDOWN_MS;
    const [dx, dy] = DIR[player.facing];
    const reach = tileSize;
    const w = dx === 0 ? tileSize : reach;
    const h = dy === 0 ? tileSize : reach;
    const cx = body.center.x + dx * (body.width / 2 + w / 2);
    const cy = body.center.y + dy * (body.height / 2 + h / 2);
    const hitbox = new Phaser.Geom.Rectangle(cx - w / 2, cy - h / 2, w, h);

    const slash = this.scene.add.rectangle(cx, cy, w, h, 0xffffff, 0.55).setDepth(15_000);
    this.scene.tweens.add({ targets: slash, alpha: 0, scaleX: 1.25, scaleY: 1.25, duration: SWING_MS, onComplete: () => slash.destroy() });

    for (const e of enemies) {
      if (!e.enemy || e.defeated || !e.sprite?.body) continue;
      const b = e.sprite.body as Phaser.Physics.Arcade.Body;
      if (Phaser.Geom.Rectangle.Overlaps(hitbox, new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height))) {
        this.hurt(e, player.attackDamage, dx, dy, now);
      }
    }
    return true;
  }

  /** Enemy touching the player: called from the physics collider. */
  enemyTouch(enemy: SpawnedEntity, player: SpawnedEntity, now: number): void {
    const en = enemy.enemy;
    if (!en || enemy.defeated || player.defeated || now < en.nextAttackAt || now < player.invulnerableUntil) return;
    en.nextAttackAt = now + en.attackCooldownMs;
    const pb = player.sprite!.body as Phaser.Physics.Arcade.Body;
    const eb = enemy.sprite!.body as Phaser.Physics.Arcade.Body;
    const dx = Math.sign(pb.center.x - eb.center.x) || 0;
    const dy = Math.sign(pb.center.y - eb.center.y) || (dx === 0 ? 1 : 0);
    this.hurt(player, en.damage, dx, dy, now);
  }

  private hurt(target: SpawnedEntity, damage: number, dx: number, dy: number, now: number): void {
    if (!target.health || !target.sprite) return;
    target.health.current = Math.max(0, target.health.current - damage);
    target.knockbackUntil = now + KNOCKBACK_MS;
    const len = Math.hypot(dx, dy) || 1;
    target.sprite.setVelocity((dx / len) * KNOCKBACK_SPEED, (dy / len) * KNOCKBACK_SPEED);
    target.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(80, () => target.sprite?.clearTint());
    if (target.isPlayer) {
      target.invulnerableUntil = now + PLAYER_INVULNERABLE_MS;
      this.scene.tweens.add({ targets: target.sprite, alpha: 0.35, yoyo: true, repeat: 4, duration: PLAYER_INVULNERABLE_MS / 10, onComplete: () => target.sprite?.setAlpha(1) });
      this.hooks.onPlayerHurt(target);
    }
    if (target.health.current === 0) {
      target.defeated = true;
      const sprite = target.sprite;
      sprite.body!.enable = false;
      sprite.setVelocity(0, 0);
      this.scene.tweens.add({ targets: sprite, alpha: 0, scaleX: 1.3, scaleY: 0.2, duration: 220, onComplete: () => { if (!target.isPlayer) sprite.setVisible(false); } });
      if (target.isPlayer) this.hooks.onPlayerDefeated(target);
      else this.hooks.onDefeated(target);
    }
  }
}
