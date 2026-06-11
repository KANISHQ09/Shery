class WorkspaceMemoryRepository {
  constructor(dbProvider) {
    this.dbProvider = dbProvider;
  }

  collection(workspaceId) {
    return this.dbProvider().collection('workspaces').doc(workspaceId).collection('memory');
  }

  async getOrCreate(workspaceId) {
    const ref = this.collection(workspaceId).doc('default');
    const doc = await ref.get();

    if (doc.exists) {
      const data = doc.data() || {};
      if (!data.learningGraph) {
        data.learningGraph = [];
      }
      return { id: doc.id, ...data };
    }

    const now = new Date().toISOString();
    const defaultMemory = {
      focusAreas: [],
      weakAreas: [],
      frequentConcepts: [],
      learningGraph: [],
      learningPatterns: {
        preferredDepth: 'standard',
        questionTypes: [],
        revisitedTopics: [],
      },
      revisionHistory: [],
      updatedAt: now,
    };

    await ref.set(defaultMemory);
    return { id: 'default', ...defaultMemory };
  }

  async update(workspaceId, data) {
    const updateData = { ...data, updatedAt: new Date().toISOString() };
    const ref = this.collection(workspaceId).doc('default');
    await ref.update(updateData);
    const doc = await ref.get();
    return { id: doc.id, ...doc.data() };
  }

  async addConcept(workspaceId, term) {
    const ref = this.collection(workspaceId).doc('default');
    const doc = await ref.get();

    if (!doc.exists) {
      await this.getOrCreate(workspaceId);
    }

    const data = (await ref.get()).data();
    const concepts = data.frequentConcepts || [];
    const existing = concepts.find((c) => c.term === term);

    if (existing) {
      existing.count += 1;
      existing.lastSeen = new Date().toISOString();
    } else {
      concepts.push({ term, count: 1, lastSeen: new Date().toISOString() });
    }

    await ref.update({
      frequentConcepts: concepts,
      updatedAt: new Date().toISOString(),
    });
  }

  async addFocusArea(workspaceId, area) {
    const ref = this.collection(workspaceId).doc('default');
    const doc = await ref.get();

    if (!doc.exists) {
      await this.getOrCreate(workspaceId);
    }

    const data = (await ref.get()).data();
    const focusAreas = data.focusAreas || [];

    if (!focusAreas.includes(area)) {
      focusAreas.push(area);
      await ref.update({
        focusAreas,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  async addWeakArea(workspaceId, area) {
    const ref = this.collection(workspaceId).doc('default');
    const doc = await ref.get();

    if (!doc.exists) {
      await this.getOrCreate(workspaceId);
    }

    const data = (await ref.get()).data();
    const weakAreas = data.weakAreas || [];

    if (!weakAreas.includes(area)) {
      weakAreas.push(area);
      await ref.update({
        weakAreas,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  async logRevision(workspaceId, topic, confidence) {
    const ref = this.collection(workspaceId).doc('default');
    const doc = await ref.get();

    if (!doc.exists) {
      await this.getOrCreate(workspaceId);
    }

    const data = (await ref.get()).data();
    const revisionHistory = data.revisionHistory || [];

    revisionHistory.push({
      topic,
      confidence,
      timestamp: new Date().toISOString(),
    });

    await ref.update({
      revisionHistory,
      updatedAt: new Date().toISOString(),
    });
  }
}

export default WorkspaceMemoryRepository;
