/**
 * Preview state management for the Kit plugin.
 *
 * Manages display mode toggle, nutrition toggle, and card preview state.
 * This is plain TypeScript — no framework dependency.
 */

import type { RecipeId } from "@crumb/shared";
import type { ApiClient } from "@/lib/api-client";
import type {
  BrandKit,
  CardRenderOptions,
  DisplayMode,
  PluginRecipe,
} from "@/lib/types";
import { DISPLAY_MODE } from "@/lib/types";
import { renderCard } from "@/lib/card-renderer";

export interface PreviewState {
  readonly recipeId: RecipeId | null;
  readonly recipe: PluginRecipe | null;
  readonly brand: BrandKit | null;
  readonly displayMode: DisplayMode;
  readonly showNutrition: boolean;
  readonly cardHtml: string | null;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly appDomain: string;
}

function createInitialState(appDomain: string): PreviewState {
  return {
    recipeId: null,
    recipe: null,
    brand: null,
    displayMode: DISPLAY_MODE.Standard,
    showNutrition: false,
    cardHtml: null,
    isLoading: false,
    error: null,
    appDomain,
  };
}

export type PreviewListener = (state: PreviewState) => void;

/**
 * Preview controller that manages display mode, nutrition toggle,
 * and card HTML rendering.
 */
export class PreviewController {
  private state: PreviewState;
  private readonly client: ApiClient;
  private readonly listeners: PreviewListener[] = [];

  constructor(client: ApiClient, appDomain: string) {
    this.client = client;
    this.state = createInitialState(appDomain);
  }

  getState(): PreviewState {
    return this.state;
  }

  subscribe(listener: PreviewListener): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  private setState(partial: Partial<PreviewState>): void {
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  /**
   * Load a recipe for preview.
   */
  async loadRecipe(recipeId: RecipeId): Promise<void> {
    this.setState({
      recipeId,
      isLoading: true,
      error: null,
      cardHtml: null,
    });

    const [recipeResult, brandResult] = await Promise.all([
      this.client.getRecipe(recipeId),
      this.client.getBrandKit(),
    ]);

    if (!recipeResult.ok) {
      this.setState({
        isLoading: false,
        error: recipeResult.error.message,
      });
      return;
    }

    const brand = brandResult.ok ? brandResult.value : null;
    const recipe = recipeResult.value;

    this.setState({
      recipe,
      brand,
      isLoading: false,
    });

    this.rerender();
  }

  /**
   * Toggle the display mode (Compact / Standard / Full).
   */
  setDisplayMode(mode: DisplayMode): void {
    this.setState({ displayMode: mode });
    this.rerender();
  }

  /**
   * Cycle through display modes: Compact -> Standard -> Full -> Compact.
   */
  cycleDisplayMode(): void {
    switch (this.state.displayMode) {
      case DISPLAY_MODE.Compact:
        this.setDisplayMode(DISPLAY_MODE.Standard);
        break;
      case DISPLAY_MODE.Standard:
        this.setDisplayMode(DISPLAY_MODE.Full);
        break;
      case DISPLAY_MODE.Full:
        this.setDisplayMode(DISPLAY_MODE.Compact);
        break;
    }
  }

  /**
   * Toggle the nutrition display.
   */
  toggleNutrition(): void {
    this.setState({ showNutrition: !this.state.showNutrition });
    this.rerender();
  }

  /**
   * Get the current card render options.
   */
  getRenderOptions(): CardRenderOptions {
    return {
      displayMode: this.state.displayMode,
      showNutrition: this.state.showNutrition,
      appDomain: this.state.appDomain,
    };
  }

  /**
   * Get the current card HTML for insertion into the email editor.
   */
  getCardHtml(): string | null {
    return this.state.cardHtml;
  }

  /**
   * Re-render the card with current state.
   */
  private rerender(): void {
    if (this.state.recipe === null) {
      this.setState({ cardHtml: null });
      return;
    }

    const options = this.getRenderOptions();
    const html = renderCard(this.state.recipe, options, this.state.brand);
    this.setState({ cardHtml: html });
  }

  /**
   * Reset the preview state.
   */
  reset(): void {
    this.state = createInitialState(this.state.appDomain);
    this.notify();
  }
}
