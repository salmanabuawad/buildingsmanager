const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface Building {
  id: string;
  name: string;
  total_units: number;
  apartment_area: number;
  storage_area: number;
  pergola_area: number;
  balcony_area: number;
  total_building_area: number;
  created_at: string;
}

export interface Apartment {
  id: string;
  building_id: string;
  apartment_number: string;
  floor?: number;
  apartment_area: number;
  storage_area: number;
  pergola_area: number;
  balcony_area: number;
  garden_area?: number;
  total_apartment_area: number;
  pdf_file_url?: string;
  dwg_file_url?: string;
  created_at: string;
}

async function fetchAPI(endpoint: string, options?: RequestInit) {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'An error occurred' }));
    throw new Error(error.detail || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}

export const api = {
  buildings: {
    getAll: (): Promise<Building[]> => fetchAPI('/api/buildings'),
    getOne: (id: string): Promise<Building> => fetchAPI(`/api/buildings/${id}`),
    create: (data: Omit<Building, 'id' | 'created_at'>): Promise<Building> =>
      fetchAPI('/api/buildings', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<Building>): Promise<Building> =>
      fetchAPI(`/api/buildings/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string): Promise<{ message: string }> =>
      fetchAPI(`/api/buildings/${id}`, { method: 'DELETE' }),
  },
  apartments: {
    getAll: (buildingId?: string): Promise<Apartment[]> => {
      const query = buildingId ? `?building_id=${buildingId}` : '';
      return fetchAPI(`/api/apartments${query}`);
    },
    getOne: (id: string): Promise<Apartment> => fetchAPI(`/api/apartments/${id}`),
    create: (data: Omit<Apartment, 'id' | 'created_at'>): Promise<Apartment> =>
      fetchAPI('/api/apartments', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<Apartment>): Promise<Apartment> =>
      fetchAPI(`/api/apartments/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string): Promise<{ message: string }> =>
      fetchAPI(`/api/apartments/${id}`, { method: 'DELETE' }),
  },
};
