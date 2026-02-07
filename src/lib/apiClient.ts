// FastAPI Client for AssetFlow
// Replaces Supabase client with REST API calls to FastAPI backend

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

interface AuthResponse {
  access_token: string;
  token_type: string;
  user: {
    id: string;
    username: string;
    email: string;
    full_name: string;
    role: string;
  };
}

class ApiClient {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('auth_token');
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    return headers;
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'An error occurred' }));
      throw new Error(error.detail || `HTTP error! status: ${response.status}`);
    }

    if (response.status === 204) {
      return null as T;
    }

    return response.json();
  }

  async login(username: string, password: string): Promise<AuthResponse> {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await this.handleResponse<AuthResponse>(response);
    this.token = data.access_token;
    localStorage.setItem('auth_token', data.access_token);
    localStorage.setItem('user', JSON.stringify(data.user));
    return data;
  }

  logout() {
    this.token = null;
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
  }

  getCurrentUser() {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  }

  async getMe() {
    const response = await fetch(`${API_URL}/auth/me`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse(response);
  }

  // Buildings API
  async getBuildings(skip = 0, limit = 1000) {
    const response = await fetch(`${API_URL}/buildings?skip=${skip}&limit=${limit}`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse(response);
  }

  async getBuilding(buildingId: string) {
    const response = await fetch(`${API_URL}/buildings/${buildingId}`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse(response);
  }

  async createBuilding(building: any) {
    const response = await fetch(`${API_URL}/buildings`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(building),
    });
    return this.handleResponse(response);
  }

  async updateBuilding(buildingId: string, building: any) {
    const response = await fetch(`${API_URL}/buildings/${buildingId}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(building),
    });
    return this.handleResponse(response);
  }

  async deleteBuilding(buildingId: string) {
    const response = await fetch(`${API_URL}/buildings/${buildingId}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    return this.handleResponse(response);
  }

  // Assets API
  async getAssets(buildingId?: number, skip = 0, limit = 5000) {
    let url = `${API_URL}/assets?skip=${skip}&limit=${limit}`;
    if (buildingId) {
      url += `&building_id=${buildingId}`;
    }
    const response = await fetch(url, {
      headers: this.getHeaders(),
    });
    return this.handleResponse(response);
  }

  async getAsset(assetId: string) {
    const response = await fetch(`${API_URL}/assets/${assetId}`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse(response);
  }

  async createAsset(asset: any) {
    const response = await fetch(`${API_URL}/assets`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(asset),
    });
    return this.handleResponse(response);
  }

  async updateAsset(assetId: string, asset: any) {
    const response = await fetch(`${API_URL}/assets/${assetId}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(asset),
    });
    return this.handleResponse(response);
  }

  async deleteAsset(assetId: string) {
    const response = await fetch(`${API_URL}/assets/${assetId}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    return this.handleResponse(response);
  }

  async bulkCreateOrUpdateAssets(assets: any[]) {
    const response = await fetch(`${API_URL}/assets/bulk`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(assets),
    });
    return this.handleResponse(response);
  }

  // Asset Types API
  async getAssetTypes() {
    const response = await fetch(`${API_URL}/asset-types`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse(response);
  }

  async getAssetType(assetTypeId: number) {
    const response = await fetch(`${API_URL}/asset-types/${assetTypeId}`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse(response);
  }

  async createAssetType(assetType: any) {
    const response = await fetch(`${API_URL}/asset-types`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(assetType),
    });
    return this.handleResponse(response);
  }

  // Files API
  async uploadFile(assetId: number, file: File, measurementDate?: string) {
    const formData = new FormData();
    formData.append('file', file);
    if (measurementDate) {
      formData.append('measurement_date', measurementDate);
    }

    const headers: HeadersInit = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_URL}/files/upload/${assetId}`, {
      method: 'POST',
      headers,
      body: formData,
    });
    return this.handleResponse(response);
  }

  async getAssetFiles(assetId: number) {
    const response = await fetch(`${API_URL}/files/asset/${assetId}`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse(response);
  }

  async deleteFile(fileId: number) {
    const response = await fetch(`${API_URL}/files/${fileId}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    return this.handleResponse(response);
  }

  async getFileDownloadUrl(fileId: number) {
    const response = await fetch(`${API_URL}/files/download/${fileId}`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse<{ url: string; filename: string }>(response);
  }

  // Audit API
  async getAuditLogs(entityType?: string, entityId?: string, skip = 0, limit = 100) {
    let url = `${API_URL}/audit?skip=${skip}&limit=${limit}`;
    if (entityType) {
      url += `&entity_type=${entityType}`;
    }
    if (entityId) {
      url += `&entity_id=${entityId}`;
    }
    const response = await fetch(url, {
      headers: this.getHeaders(),
    });
    return this.handleResponse(response);
  }

  async getAuditLog(auditId: number) {
    const response = await fetch(`${API_URL}/audit/${auditId}`, {
      headers: this.getHeaders(),
    });
    return this.handleResponse(response);
  }
}

export const apiClient = new ApiClient();
export default apiClient;
