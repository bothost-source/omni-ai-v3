/**
 * OMNI Chat History & Memory Manager
 * Created by: lordtarrific
 */

const fs = require('fs-extra');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data');
const HISTORY_DIR = path.join(DATA_DIR, 'history');
const MEMORY_DIR = path.join(DATA_DIR, 'memory');

async function ensureDirs() {
  await fs.ensureDir(HISTORY_DIR);
  await fs.ensureDir(MEMORY_DIR);
}

function getUserFile(userId) {
  return path.join(HISTORY_DIR, `${userId}.json`);
}

function getMemoryFile(userId) {
  return path.join(MEMORY_DIR, `${userId}.json`);
}

class HistoryManager {
  async getHistory(userId) {
    await ensureDirs();
    const file = getUserFile(userId);
    if (await fs.pathExists(file)) {
      return await fs.readJson(file);
    }
    return { messages: [], profile: {} };
  }

  async saveHistory(userId, data) {
    await ensureDirs();
    await fs.writeJson(getUserFile(userId), data, { spaces: 2 });
  }

  async addMessage(userId, role, content) {
    const history = await this.getHistory(userId);
    history.messages.push({ 
      role, 
      content: String(content || '').slice(0, 8000), 
      timestamp: Date.now() 
    });
    if (history.messages.length > 100) {
      history.messages = history.messages.slice(-100);
    }
    await this.saveHistory(userId, history);
  }

  async getMessages(userId, limit = 20) {
    const history = await this.getHistory(userId);
    return history.messages.slice(-limit);
  }

  async updateProfile(userId, updates) {
    const history = await this.getHistory(userId);
    history.profile = { ...history.profile, ...updates };
    await this.saveHistory(userId, history);
  }

  async addMemory(userId, content, source = 'user') {
    await ensureDirs();
    const file = getMemoryFile(userId);
    let memories = [];
    if (await fs.pathExists(file)) {
      memories = await fs.readJson(file);
    }
    memories.push({ 
      content: String(content || '').slice(0, 1000), 
      source, 
      timestamp: Date.now() 
    });
    if (memories.length > 50) {
      memories = memories.slice(-50);
    }
    await fs.writeJson(file, memories, { spaces: 2 });
  }

  async formatMemoryContext(userId) {
    await ensureDirs();
    const file = getMemoryFile(userId);
    if (!(await fs.pathExists(file))) return '';
    const memories = (await fs.readJson(file)).slice(-10);
    if (!memories.length) return '';
    return 'User memories:\n' + memories.map(m => `- ${m.content}`).join('\n');
  }
}

module.exports = new HistoryManager();
