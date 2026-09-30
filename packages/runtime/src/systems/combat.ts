import Phaser from 'phaser';
import type { SpawnedEntity } from '../world/spawnEntity.js';
import { attackAnimation, playIdle } from './animation.js';
import type { Effects } from './effects.js';

const DIR = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as const;
/** Swing timing when the character has no attack animation: a lunge tween of the sprite. */
const LUNGE_MS = 150;
const LUNGE_PX = 5;
const ATTACK_COOLDOWN_MS = 320;
const KNOCKBACK_MS = 140;
const KNOCKBACK_SPEED = 220;
const PLAYER_INVULNERABLE_MS = 700;
const HIT_STOP_MS = 60;
const FLASH_MS = 80;

export interface CombatHooks {
  onPlayerHurt(player: SpawnedEntity): void;
  onDefeated(e: SpawnedEntity): void;
  onPlayerDefeated(player: SpawnedEntity): void;
}

/**
 * Player swings, enemies lunge. Both resolve through `hurt`, which handles knockback, flash, feedback and defeat.
 * Timing uses the scene clock and tweens only, so it is frame-rate independent.
 */
export class CombatSystem {
  private nextSwingAt = 0;

  constructor(private scene: Phaser.Scene, private effects: Effects, private hooks: CombatHooks) {}

  /**
   * Starts a swing in the player's facing direction. With an `attack_<facing>` animation the strike lands on its
   * second frame and movement stays locked until it ends; without one the sprite lunges and the strike is immediate.
   * Returns false when the player is on cooldown, mid-swing or defeated.
   */
  swing(player: SpawnedEntity, enemies: SpawnedEntity[], now: number, tileSize: number): boolean {
    const sprite = player.sprite;
    const body = sprite?.body as Phaser.Physics.Arcade.Body | undefined;
    if (!sprite || !body || now < this.nextSwingAt || now < player.attackUntil || player.defeated) return false;
    this.nextSwingAt = now + ATTACK_COOLDOWN_MS;
    const facing = player.facing;
    const [dx, dy] = DIR[facing];

    const strike = () => {
      if (player.defeated || !player.sprite) return;
      const b = player.sprite.body as Phaser.Physics.Arcade.Body;
      const reach = tileSize;
      const w = dx === 0 ? tileSize : reach;
      const h = dy === 0 ? tileSize : reach;
      const cx = b.center.x + dx * (b.width / 2 + w / 2);
      const cy = b.center.y + dy * (b.height / 2 + h / 2);
      const hitbox = new Phaser.Geom.Rectangle(cx - w / 2, cy - h / 2, w, h);
      // The arc sweeps around the player's chest, reaching through the hitbox.
      this.effects.slash(b.center.x, b.center.y - b.height / 2, facing, tileSize);

      let landed = false;
      for (const e of enemies) {
        if (!e.enemy || e.defeated || !e.sprite?.body) continue;
        const eb = e.sprite.body as Phaser.Physics.Arcade.Body;
        const rect = new Phaser.Geom.Rectangle(eb.x, eb.y, eb.width, eb.height);
        if (!Phaser.Geom.Rectangle.Overlaps(hitbox, rect)) continue;
        const contact = Phaser.Geom.Rectangle.Intersection(hitbox, rect);
        const px = contact.width > 0 ? contact.centerX : eb.center.x;
        const py = contact.height > 0 ? contact.centerY : eb.center.y;
        this.hurt(e, player.attackDamage, dx, dy, now, px, py);
        landed = true;
      }
      if (landed) {
        this.effects.hitStop(HIT_STOP_MS);
        // The attack animation freezes with the world; keep the movement lock in step with it.
        player.attackUntil += HIT_STOP_MS;
      }
    };

    const anim = attackAnimation(player, facing);
    if (anim) {
      player.attackUntil = now + anim.durationMs;
      sprite.setVelocity(0, 0);
      sprite.play(anim.key);
      sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => { if (!player.defeated) playIdle(player); });
      if (anim.strikeMs > 0) this.scene.time.delayedCall(anim.strikeMs, strike);
      else strike();
    } else {
      player.attackUntil = now + LUNGE_MS;
      sprite.setVelocity(0, 0);
      playIdle(player);
      const x0 = sprite.x; const y0 = sprite.y;
      this.scene.tweens.add({
        targets: sprite, x: x0 + dx * LUNGE_PX, y: y0 + dy * LUNGE_PX, scaleX: 1 + Math.abs(dx) * 0.08, scaleY: 1 + Math.abs(dy) * 0.08,
        duration: LUNGE_MS / 2, yoyo: true, ease: 'Quad.easeOut',
        onComplete: () => sprite.setScale(1),
      });
      strike();
    }
    return true;
  }

  /**
   * Enemy touching the player: called from the physics collider every frame the bodies meet. Damage lands only while
   * the enemy is in the lunge phase of its telegraphed attack, and at most once per lunge.
   */
  enemyTouch(enemy: SpawnedEntity, player: SpawnedEntity, now: number): void {
    const en = enemy.enemy;
    if (!en || enemy.defeated || player.defeated || en.phase !== 'lunge' || en.struck || now < player.invulnerableUntil) return;
    en.struck = true;
    const pb = player.sprite!.body as Phaser.Physics.Arcade.Body;
    const eb = enemy.sprite!.body as Phaser.Physics.Arcade.Body;
    const dx = Math.sign(pb.center.x - eb.center.x) || 0;
    const dy = Math.sign(pb.center.y - eb.center.y) || (dx === 0 ? 1 : 0);
    const contact = Phaser.Geom.Rectangle.Intersection(new Phaser.Geom.Rectangle(pb.x, pb.y, pb.width, pb.height), new Phaser.Geom.Rectangle(eb.x, eb.y, eb.width, eb.height));
    const cx = contact.width > 0 ? contact.centerX : (pb.center.x + eb.center.x) / 2;
    const cy = contact.height > 0 ? contact.centerY : (pb.center.y + eb.center.y) / 2;
    this.hurt(player, en.damage, dx, dy, now, cx, cy);
  }

  private hurt(target: SpawnedEntity, damage: number, dx: number, dy: number, now: number, contactX: number, contactY: number): void {
    const sprite = target.sprite;
    if (!target.health || !sprite) return;
    target.health.current = Math.max(0, target.health.current - damage);
    target.knockbackUntil = now + KNOCKBACK_MS;
    const len = Math.hypot(dx, dy) || 1;
    sprite.setVelocity((dx / len) * KNOCKBACK_SPEED, (dy / len) * KNOCKBACK_SPEED);
    sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(FLASH_MS, () => sprite.clearTint());
    this.effects.sparks(contactX, contactY, dx, dy, target.isPlayer ? [0xffffff, 0xffb3b3, 0xff6b81] : undefined);
    this.effects.damageNumber(contactX, contactY - 6, damage, target.isPlayer ? '#ff6b81' : '#ffffff');
    if (target.enemy) {
      this.interruptEnemy(target);
      // Scale punch: squashed flat by the blow, springing back.
      sprite.setScale(1.25, 0.8);
      this.scene.tweens.add({ targets: sprite, scaleX: 1, scaleY: 1, duration: 160, ease: 'Back.easeOut' });
    }
    if (target.isPlayer) {
      target.invulnerableUntil = now + PLAYER_INVULNERABLE_MS;
      this.scene.tweens.killTweensOf(sprite);
      sprite.setScale(1);
      this.scene.tweens.add({ targets: sprite, alpha: 0.35, yoyo: true, repeat: 4, duration: PLAYER_INVULNERABLE_MS / 10, onComplete: () => sprite.setAlpha(1) });
      this.hooks.onPlayerHurt(target);
    }
    if (target.health.current === 0) {
      target.defeated = true;
      sprite.body!.enable = false;
      sprite.setVelocity(0, 0);
      this.scene.tweens.killTweensOf(sprite);
      sprite.setAlpha(1).setScale(1);
      if (!target.isPlayer) this.effects.burst(target);
      this.scene.tweens.add({ targets: sprite, alpha: 0, scaleX: 1.3, scaleY: 0.2, duration: 220, onComplete: () => { if (!target.isPlayer) sprite.setVisible(false); } });
      if (target.isPlayer) this.hooks.onPlayerDefeated(target);
      else this.hooks.onDefeated(target);
    }
  }

  /** A hit cancels whatever attack the enemy was winding up; the cooldown it already spent stays spent. */
  private interruptEnemy(e: SpawnedEntity): void {
    const en = e.enemy;
    if (!en || !e.sprite) return;
    en.telegraph?.stop();
    en.telegraph = null;
    en.phase = 'chase';
    en.phaseUntil = 0;
    en.struck = false;
    e.sprite.setScale(1);
    playIdle(e);
  }
}
