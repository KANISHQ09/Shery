import { v4 as uuidv4 } from 'uuid';

class WorkspaceOutputRepository {
  constructor(dbProvider) {
    this.dbProvider = dbProvider;
  }

  collection(workspaceId) {
    return this.dbProvider().collection('workspaces').doc(workspaceId).collection('outputs');
  }

  async create(workspaceId, data) {
    const now = new Date().toISOString();
    const ref = this.collection(workspaceId).doc();
    const artifactId = data.artifactId || uuidv4();
    const version = data.version || 1;
    const isLatest = data.isLatest !== false;

    // Mark previous versions as isLatest = false
    if (isLatest && data.artifactId) {
      const olderVersions = await this.collection(workspaceId)
        .where('artifactId', '==', data.artifactId)
        .where('isLatest', '==', true)
        .get();
      if (!olderVersions.empty) {
        const batch = this.dbProvider().batch();
        olderVersions.forEach((doc) => {
          batch.update(doc.ref, { isLatest: false, updatedAt: now });
        });
        await batch.commit();
      }
    }

    const outputData = {
      ...data,
      artifactId,
      version,
      isLatest,
      status: data.status || 'generating',
      createdAt: data.createdAt || now,
      updatedAt: now,
    };
    delete outputData.id;

    await ref.set(outputData);
    return { id: ref.id, ...outputData };
  }

  async findByWorkspace(workspaceId) {
    const snapshot = await this.collection(workspaceId)
      .orderBy('createdAt', 'desc')
      .get();

    const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    
    // Deduplicate on artifactId to return only the latest version, keeping legacy documents intact
    const seen = new Set();
    return list.filter((item) => {
      if (!item.artifactId) return true;
      if (seen.has(item.artifactId)) return false;
      seen.add(item.artifactId);
      return true;
    });
  }

  async findById(workspaceId, outputId) {
    const doc = await this.collection(workspaceId).doc(outputId).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  }

  async getVersionsForArtifact(workspaceId, artifactId) {
    if (!artifactId) return [];
    const snapshot = await this.collection(workspaceId)
      .where('artifactId', '==', artifactId)
      .get();
    const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return list.sort((a, b) => (b.version || 0) - (a.version || 0));
  }

  async duplicateArtifact(workspaceId, outputId) {
    const existing = await this.findById(workspaceId, outputId);
    if (!existing) return null;

    const newArtifactId = uuidv4();
    const cleanData = {
      ...existing,
      artifactId: newArtifactId,
      version: 1,
      isLatest: true,
      title: `${existing.title} (Copy)`,
    };
    delete cleanData.id;
    return this.create(workspaceId, cleanData);
  }

  async update(workspaceId, outputId, data) {
    const updateData = { ...data, updatedAt: new Date().toISOString() };
    delete updateData.id;
    await this.collection(workspaceId).doc(outputId).update(updateData);
    return this.findById(workspaceId, outputId);
  }

  async delete(workspaceId, outputId) {
    await this.collection(workspaceId).doc(outputId).delete();
    return true;
  }
}

export default WorkspaceOutputRepository;
