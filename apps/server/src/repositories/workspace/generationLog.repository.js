class GenerationLogRepository {
  constructor(dbProvider) {
    this.dbProvider = dbProvider;
  }

  collection() {
    return this.dbProvider().collection('generation_logs');
  }

  /**
   * Logs a generation asset request.
   * @param {object} param0 
   * @returns {Promise<object>}
   */
  async log({
    workspaceId,
    userId,
    artifactType,
    provider,
    model,
    generationDuration,
    generationStatus,
    promptLength,
  }) {
    const docRef = this.collection().doc();
    const logData = {
      workspaceId: workspaceId || '',
      userId: userId || 'anonymous',
      artifactType: artifactType || '',
      provider: provider || '',
      model: model || '',
      generationDuration: generationDuration || 0,
      generationStatus: generationStatus || 'success',
      promptLength: promptLength || 0,
      createdAt: new Date().toISOString(),
    };
    await docRef.set(logData);
    return { id: docRef.id, ...logData };
  }
}

export default GenerationLogRepository;
