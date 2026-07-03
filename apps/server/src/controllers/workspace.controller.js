import workspaceContainer from '../container/workspaceContainer.js';
import ApiResponse from '../utils/ApiResponse.js';
import logger from '../loggers/logger.js';

class WorkspaceController {
  // Hidden diagnostics health panel route
  async getHealth(req, res, next) {
    try {
      const { providerHealthStatus } = await import('../config/providerStatusState.js');
      res.json(providerHealthStatus);
    } catch (error) {
      next(error);
    }
  }

  // 1. List user workspaces
  async listWorkspaces(req, res, next) {
    try {
      const list = await workspaceContainer.workspaceRepository.findByUser(req.userId);
      res.json(ApiResponse.success({ list }, 'Workspaces fetched successfully'));
    } catch (error) {
      next(error);
    }
  }

  // 2. Create workspace
  async createWorkspace(req, res, next) {
    try {
      const { name, emoji } = req.body;
      if (!name?.trim()) {
        return res.status(400).json(ApiResponse.error('Workspace name is required.', 400));
      }
      const workspace = await workspaceContainer.workspaceRepository.create({
        name: name.trim(),
        emoji: emoji || '🧠',
        userId: req.userId,
      });
      res.status(201).json(ApiResponse.success(workspace, 'Workspace created successfully'));
    } catch (error) {
      next(error);
    }
  }

  // 3. Get workspace detail
  async getWorkspace(req, res, next) {
    try {
      const wid = req.params.wid;
      const sources = await workspaceContainer.workspaceSourceRepository.findByWorkspace(wid);
      const outputs = await workspaceContainer.workspaceOutputRepository.findByWorkspace(wid);
      
      res.json(ApiResponse.success({
        workspace: req.workspace,
        sources,
        outputs: outputs.slice(0, 10),
      }, 'Workspace detail fetched'));
    } catch (error) {
      next(error);
    }
  }

  // 4. Update workspace
  async updateWorkspace(req, res, next) {
    try {
      const { name, emoji } = req.body;
      const updates = {};
      if (name?.trim()) updates.name = name.trim();
      if (emoji) updates.emoji = emoji;

      const updated = await workspaceContainer.workspaceRepository.update(req.params.wid, updates);
      res.json(ApiResponse.success(updated, 'Workspace updated successfully'));
    } catch (error) {
      next(error);
    }
  }

  // 5. Delete workspace
  async deleteWorkspace(req, res, next) {
    try {
      const wid = req.params.wid;
      
      await workspaceContainer.embeddingService.deleteWorkspaceVectors(wid);

      const sources = await workspaceContainer.workspaceSourceRepository.findByWorkspace(wid);
      for (const src of sources) {
        await workspaceContainer.workspaceSourceRepository.delete(wid, src.id);
      }

      const chats = await workspaceContainer.workspaceChatRepository.findByWorkspace(wid);
      for (const chat of chats) {
        await workspaceContainer.workspaceChatRepository.delete(wid, chat.id);
      }

      const outputs = await workspaceContainer.workspaceOutputRepository.findByWorkspace(wid);
      for (const out of outputs) {
        await workspaceContainer.workspaceOutputRepository.delete(wid, out.id);
      }

      try {
        await workspaceContainer.workspaceStorageService.deleteWorkspaceDir(wid);
      } catch (storageErr) {
        logger.error('Failed to purge local storage directory for workspace', { wid, error: storageErr.message });
      }

      await workspaceContainer.workspaceRepository.delete(wid);

      res.json(ApiResponse.success({ success: true }, 'Workspace deleted and cascade purged successfully'));
    } catch (error) {
      next(error);
    }
  }
}

export const workspaceController = new WorkspaceController();
export default workspaceController;
