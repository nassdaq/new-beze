import type Phaser from 'phaser';
import type { SpawnedEntity } from '../world/spawnEntity.js';
import { animate, facingFromVelocity, updateWander } from './wander.js';
import { attackAnimation } from './animation.js';

/** Telegraph and lunge timing. The cooldown between attacks stays data-driven (`attackCooldownMs`). */
const WINDUP_MS = 280;
const LUNGE_MS = 180;
const RECOVER_MS = 260;
const LUNGE_SPEED_FACTOR = 3.2;
const LUNGE_SPEED_MIN = 150;
/** How close (body edge to body edge) the enemy gets before it winds up an attack. */
const STRIKE_GAP = 10;
const FACING_VECTOR: Record<SpawnedEntity['facing'], readonly [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

/**
 * Chases the player inside the aggro radius; otherwise wanders or idles. In striking range and off cooldown it
 * telegraphs (attack animation, or a squash tween), lunges at the player, then recovers. Contact damage lives in
 * combat.ts and only lands during the lunge.
 */
export function updateEnemy(scene: Phaser.Scene, e: SpawnedEntity, player: SpawnedEntity | null, now: number): void {
  const en = e.enemy;
  const sprite = e.sprite;
  if (!en || !sprite || e.defeated) return;
  sprite.setDepth(sprite.y);
  if (now < e.knockbackUntil) return;

  if (en.phase !== 'chase') {
    if (now < en.phaseUntil) {
      if (en.phase !== 'lunge') sprite.setVelocity(0, 0);
      return;
    }
    if (en.phase === 'windup') {
      startLunge(scene, e, player, now);
      return;
    }
    if (en.phase === 'lunge') {
      en.phase = 'recover';
      en.phaseUntil = now + RECOVER_MS;
      sprite.setVelocity(0, 0);
      animate(e, 0, 0);
      return;
    }
    en.phase = 'chase';
  }

  const target = player?.sprite;
  if (target && player && !player.defeated) {
    const tb = target.body as Phaser.Physics.Arcade.Body;
    const sb = sprite.body as Phaser.Physics.Arcade.Body;
    const dx = tb.center.x - sb.center.x;
    const dy = tb.center.y - sb.center.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= en.aggroRadius) {
      const gapX = Math.abs(dx) - (tb.halfWidth + sb.halfWidth);
      const gapY = Math.abs(dy) - (tb.halfHeight + sb.halfHeight);
      const inRange = Math.max(gapX, gapY) <= STRIKE_GAP;
      if (inRange && now >= en.nextAttackAt) {
        startWindup(scene, e, dx, dy, now);
        return;
      }
      if (inRange) {
        // Waiting out the cooldown: hold position, face the player.
        sprite.setVelocity(0, 0);
        e.facing = facingFromVelocity(dx, dy, e.facing);
        animate(e, 0, 0);
        return;
      }
      const vx = (dx / dist) * en.speed;
      const vy = (dy / dist) * en.speed;
      sprite.setVelocity(vx, vy);
      animate(e, vx, vy);
      return;
    }
  }
  if (e.wander) {
    updateWander(e, now);
    return;
  }
  sprite.setVelocity(0, 0);
  animate(e, 0, 0);
}

function startWindup(scene: Phaser.Scene, e: SpawnedEntity, dx: number, dy: number, now: number): void {
  const en = e.enemy!;
  const sprite = e.sprite!;
  en.nextAttackAt = now + en.attackCooldownMs;
  en.phase = 'windup';
  en.phaseUntil = now + WINDUP_MS;
  en.struck = false;
  sprite.setVelocity(0, 0);
  e.facing = facingFromVelocity(dx, dy, e.facing);
  const anim = attackAnimation(e, e.facing);
  if (anim) {
    // Hold the anticipation frame through the wind-up so the strike frame lands as the lunge starts.
    sprite.play({ key: anim.key, delay: Math.max(0, WINDUP_MS - anim.strikeMs), showBeforeDelay: true });
    return;
  }
  animate(e, 0, 0);
  en.telegraph?.stop();
  sprite.setScale(1);
  en.telegraph = scene.tweens.add({
    targets: sprite, scaleX: 1.22, scaleY: 0.78, duration: WINDUP_MS * 0.7, ease: 'Quad.easeOut', yoyo: true, hold: 0,
    onComplete: () => { sprite.setScale(1); en.telegraph = null; },
  });
}

function startLunge(scene: Phaser.Scene, e: SpawnedEntity, player: SpawnedEntity | null, now: number): void {
  const en = e.enemy!;
  const sprite = e.sprite!;
  en.phase = 'lunge';
  en.phaseUntil = now + LUNGE_MS;
  en.struck = false;
  const sb = sprite.body as Phaser.Physics.Arcade.Body;
  const tb = player?.sprite?.body as Phaser.Physics.Arcade.Body | undefined;
  let dx = 0; let dy = 0;
  if (tb && player && !player.defeated) { dx = tb.center.x - sb.center.x; dy = tb.center.y - sb.center.y; }
  const len = Math.hypot(dx, dy);
  if (len < 1) {
    const f = FACING_VECTOR[e.facing];
    dx = f[0]; dy = f[1];
  } else { dx /= len; dy /= len; }
  const speed = Math.max(LUNGE_SPEED_MIN, en.speed * LUNGE_SPEED_FACTOR);
  sprite.setVelocity(dx * speed, dy * speed);
  e.facing = facingFromVelocity(dx, dy, e.facing);
  if (!attackAnimation(e, e.facing)) {
    animate(e, dx, dy);
    // Stretch into the lunge, settle back by the time it ends.
    en.telegraph?.stop();
    sprite.setScale(1);
    en.telegraph = scene.tweens.add({
      targets: sprite, scaleX: 0.86, scaleY: 1.16, duration: LUNGE_MS * 0.4, yoyo: true, ease: 'Sine.easeOut',
      onComplete: () => { sprite.setScale(1); en.telegraph = null; },
    });
  }
}
