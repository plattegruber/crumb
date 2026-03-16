/**
 * API client for communicating with the Crumb API from within the Kit editor.
 *
 * This client will handle authentication, request formatting, and response
 * parsing for all plugin-to-API communication.
 */
export class ApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }
}
