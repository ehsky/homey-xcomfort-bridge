/**
 * xComfort Scene Manager
 *
 * Manages scene discovery and activation using real scene names from the bridge.
 */

import type { XComfortBridge } from './connection/XComfortBridge.mjs';
import type { XComfortScene } from './types.mjs';

/**
 * Scene data as stored in the manager
 */
interface SceneData {
  id: number;
  name: string;
  devices: unknown[];
  originalData: XComfortScene;
}

/**
 * Scene reference for autocomplete/display
 */
export interface SceneReference {
  id: number;
  name: string;
}

/**
 * Result of scene activation
 */
export interface SceneActivationResult {
  success: boolean;
  sceneName: string;
}

class XComfortSceneManager {
  private connection: XComfortBridge;
  private scenes: Map<number, SceneData>;

  constructor(connection: XComfortBridge) {
    this.connection = connection;
    this.scenes = new Map();
  }

  /**
   * Discover scenes from the bridge data
   * Uses real scene names provided by the bridge
   */
  async discoverScenes(): Promise<SceneReference[]> {
    const detailedScenes = this.connection.getDetailedScenes();

    if (!detailedScenes || detailedScenes.length === 0) {
      console.log('[XComfort] No scenes found in bridge data');
      return [];
    }

    console.log(
      `[XComfort] Processing ${detailedScenes.length} scenes from bridge`
    );

    this.scenes.clear();

    const sceneList = detailedScenes.map((scene, index) => {
      const sceneId = scene.sceneId ?? index;
      const sceneName = scene.name ?? `Scene ${index + 1}`;

      // Store scene data
      this.scenes.set(sceneId, {
        id: sceneId,
        name: sceneName,
        devices: scene.devices ?? [],
        originalData: scene,
      });

      console.log(`[XComfort] Scene: "${sceneName}" (ID: ${sceneId})`);

      return {
        id: sceneId,
        name: sceneName,
      };
    });

    console.log(
      `[XComfort] Scene discovery complete: ${sceneList.length} scenes available`
    );
    return sceneList;
  }

  /**
   * Get available scenes for autocomplete
   */
  getAvailableScenes(): SceneReference[] {
    return Array.from(this.scenes.values()).map((scene) => ({
      id: scene.id,
      name: scene.name,
    }));
  }

  /**
   * Filter scenes for autocomplete suggestions
   */
  filterScenes(query: string): SceneReference[] {
    const scenes = this.getAvailableScenes();

    if (!query) {
      return scenes;
    }

    const lowerQuery = query.toLowerCase();
    return scenes.filter((scene) =>
      scene.name.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Activate a scene by name or ID
   */
  async activateScene(
    sceneIdentifier: string | number
  ): Promise<SceneActivationResult> {
    let scene: SceneData | undefined;

    // Try to find by exact name first
    for (const sceneData of this.scenes.values()) {
      if (sceneData.name === sceneIdentifier) {
        scene = sceneData;
        break;
      }
    }

    // If not found by name, try by ID (if number)
    if (!scene && typeof sceneIdentifier === 'number') {
      scene = this.scenes.get(sceneIdentifier);
    }

    // If still not found, try parsing as numeric ID
    if (!scene && typeof sceneIdentifier === 'string') {
      const numericId = parseInt(sceneIdentifier, 10);
      if (!isNaN(numericId)) {
        scene = this.scenes.get(numericId);
      }
    }

    if (!scene) {
      throw new Error(`Scene not found: ${sceneIdentifier}`);
    }

    console.log(
      `[XComfort] Activating scene: "${scene.name}" (ID: ${scene.id})`
    );

    try {
      await this.connection.activateScene(scene.id);
      console.log(`[XComfort] Scene "${scene.name}" activated successfully`);
      return { success: true, sceneName: scene.name };
    } catch (error) {
      console.error(
        `[XComfort] Failed to activate scene "${scene.name}":`,
        error
      );
      throw error;
    }
  }
}

export default XComfortSceneManager;
