const config = require("./game-core-config.json");

const zombie = config.zombie || {};
const variants = zombie.variants || {};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getZombieSpecialChance(waveIndex) {
  const base = Number(zombie.specialChanceBase || 0.2);
  const extra = Math.floor((Math.max(1, waveIndex) - 1) / 10) * 0.1;
  return clamp(base + extra, 0, 1);
}

function pickZombieVariantKey(waveIndex, random = Math.random()) {
  const specialChance = getZombieSpecialChance(waveIndex);
  if (random >= specialChance) {
    return "base";
  }
  return Math.random() < 0.5 ? "dog" : "tank";
}

function getZombieVariantStats(variantKey) {
  return variants[variantKey] || variants.base || null;
}

function pickPauseCards(pool, count = 3) {
  const source = Array.isArray(pool) ? [...pool] : [];
  for (let i = source.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [source[i], source[j]] = [source[j], source[i]];
  }
  return source.slice(0, Math.max(1, count));
}

function applyUpgradeToState(state, cardId, maxHealth = 100) {
  if (!state || !cardId) {
    return state;
  }

  if (cardId === "attack-speed") {
    state.attackSpeedMultiplier *= 1.05;
  } else if (cardId === "double-jump") {
    state.bonusJumpCharges += 1;
  } else if (cardId === "extra-life") {
    state.extraLives += 1;
  } else if (cardId === "run-speed") {
    state.moveSpeedMultiplier *= 1.05;
  } else if (cardId === "heal-50") {
    state.health = Math.min(maxHealth, state.health + 50);
  } else if (cardId === "damage-up") {
    state.damageMultiplier *= 1.05;
  }

  return state;
}

function resolvePauseChoices(
  offeredCards,
  hostChoice,
  guestChoice,
  fallbackPool,
) {
  const offered =
    Array.isArray(offeredCards) && offeredCards.length > 0
      ? offeredCards
      : pickPauseCards(fallbackPool || [], 3);
  const fallback =
    offered[0] || (Array.isArray(fallbackPool) ? fallbackPool[0] : null);

  return {
    offered,
    hostChoice: offered.includes(hostChoice) ? hostChoice : fallback,
    guestChoice: offered.includes(guestChoice)
      ? guestChoice
      : offered[1] || fallback,
  };
}

module.exports = {
  config,
  getZombieSpecialChance,
  pickZombieVariantKey,
  getZombieVariantStats,
  pickPauseCards,
  applyUpgradeToState,
  resolvePauseChoices,
};
