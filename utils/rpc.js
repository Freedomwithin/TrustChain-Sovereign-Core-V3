const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const fetchWithRetry = async (fn, maxRetries = 3, baseDelay = 500) => {
  let retries = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      const isRateLimit = (error.message && error.message.includes('429')) ||
        (error.response && error.response.status === 429) ||
        (error.code === 429);

      if (isRateLimit) {
        retries++;
        if (retries > maxRetries) throw error;
        const waitTime = baseDelay * Math.pow(2, retries - 1);
        console.warn(`RPC Rate Limit (429). Retrying in ${waitTime}ms... (Attempt ${retries}/${maxRetries})`);
        await delay(waitTime);
      } else {
        throw error;
      }
    }
  }
};