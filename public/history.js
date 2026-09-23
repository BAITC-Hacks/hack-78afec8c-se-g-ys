(function exposeHistory(global) {
  const STORAGE_KEY = 'qala.accepted-attempts.v1';

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(freeze);
    return Object.freeze(value);
  }

  function immutableCopy(value) {
    return freeze(clone(value));
  }

  function defaultId() {
    if (global.crypto?.randomUUID) return global.crypto.randomUUID();
    return `attempt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function compareAttempts(leftAttempt, rightAttempt) {
    if (!leftAttempt?.result || !rightAttempt?.result) {
      throw new TypeError('Two accepted attempts are required for comparison');
    }
    const leftDistricts = new Map(leftAttempt.result.districts.map((district) => [district.id, district]));
    const districts = rightAttempt.result.districts.map((rightDistrict) => {
      const leftDistrict = leftDistricts.get(rightDistrict.id);
      const indicatorIds = new Set([...Object.keys(leftDistrict.changes), ...Object.keys(rightDistrict.changes)]);
      return {
        id: rightDistrict.id,
        name: rightDistrict.name,
        changeDeltas: Object.fromEntries([...indicatorIds].map((indicatorId) => [
          indicatorId,
          (rightDistrict.changes[indicatorId] ?? 0) - (leftDistrict.changes[indicatorId] ?? 0),
        ])),
      };
    });
    return immutableCopy({
      left: {
        id: leftAttempt.id,
        decisions: leftAttempt.decisions,
        cost: leftAttempt.result.cost,
        score: leftAttempt.result.score,
      },
      right: {
        id: rightAttempt.id,
        decisions: rightAttempt.decisions,
        cost: rightAttempt.result.cost,
        score: rightAttempt.result.score,
      },
      costDelta: rightAttempt.result.cost - leftAttempt.result.cost,
      scoreDelta: rightAttempt.result.score - leftAttempt.result.score,
      districts,
    });
  }

  function createAttemptHistory(storage, options = {}) {
    const now = options.now ?? (() => new Date().toISOString());
    const id = options.id ?? defaultId;

    function read() {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return [];
      try {
        const attempts = JSON.parse(raw);
        return Array.isArray(attempts) ? attempts : [];
      } catch {
        return [];
      }
    }

    return {
      list() {
        return immutableCopy(read());
      },
      append(acceptedScenario) {
        if (!acceptedScenario?.accepted || !Array.isArray(acceptedScenario.decisions) || !acceptedScenario.result) {
          throw new TypeError('Only an accepted scenario with decisions and a result can be saved');
        }
        const attempt = immutableCopy({
          id: id(),
          acceptedAt: now(),
          decisions: acceptedScenario.decisions,
          result: acceptedScenario.result,
        });
        const attempts = read();
        attempts.push(attempt);
        storage.setItem(STORAGE_KEY, JSON.stringify(attempts));
        return immutableCopy(attempt);
      },
    };
  }

  const api = { STORAGE_KEY, compareAttempts, createAttemptHistory };
  if (typeof module !== 'undefined') module.exports = api;
  global.QalaHistory = api;
}(typeof globalThis === 'undefined' ? {} : globalThis));
