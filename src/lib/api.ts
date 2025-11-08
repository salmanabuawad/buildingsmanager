import { GraphQLClient, gql } from 'graphql-request';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const GRAPHQL_ENDPOINT = `${API_URL}/graphql`;

const client = new GraphQLClient(GRAPHQL_ENDPOINT);

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

const GET_BUILDINGS = gql`
  query GetBuildings {
    buildings {
      id
      name
      totalUnits
      apartmentArea
      storageArea
      pergolaArea
      balconyArea
      totalBuildingArea
      createdAt
    }
  }
`;

const GET_BUILDING = gql`
  query GetBuilding($id: String!) {
    building(id: $id) {
      id
      name
      totalUnits
      apartmentArea
      storageArea
      pergolaArea
      balconyArea
      totalBuildingArea
      createdAt
    }
  }
`;

const GET_APARTMENTS = gql`
  query GetApartments($buildingId: String) {
    apartments(buildingId: $buildingId) {
      id
      buildingId
      apartmentNumber
      floor
      apartmentArea
      storageArea
      pergolaArea
      balconyArea
      gardenArea
      totalApartmentArea
      pdfFileUrl
      dwgFileUrl
      createdAt
    }
  }
`;

const GET_APARTMENT = gql`
  query GetApartment($id: String!) {
    apartment(id: $id) {
      id
      buildingId
      apartmentNumber
      floor
      apartmentArea
      storageArea
      pergolaArea
      balconyArea
      gardenArea
      totalApartmentArea
      pdfFileUrl
      dwgFileUrl
      createdAt
    }
  }
`;

const UPDATE_APARTMENT = gql`
  mutation UpdateApartment($id: String!, $input: ApartmentUpdateInput!) {
    updateApartment(id: $id, input: $input) {
      id
      buildingId
      apartmentNumber
      floor
      apartmentArea
      storageArea
      pergolaArea
      balconyArea
      gardenArea
      totalApartmentArea
      pdfFileUrl
      dwgFileUrl
      createdAt
    }
  }
`;

function transformBuilding(data: any): Building {
  return {
    id: data.id,
    name: data.name,
    total_units: data.totalUnits,
    apartment_area: data.apartmentArea,
    storage_area: data.storageArea,
    pergola_area: data.pergolaArea,
    balcony_area: data.balconyArea,
    total_building_area: data.totalBuildingArea,
    created_at: data.createdAt,
  };
}

function transformApartment(data: any): Apartment {
  return {
    id: data.id,
    building_id: data.buildingId,
    apartment_number: data.apartmentNumber,
    floor: data.floor,
    apartment_area: data.apartmentArea,
    storage_area: data.storageArea,
    pergola_area: data.pergolaArea,
    balcony_area: data.balconyArea,
    garden_area: data.gardenArea,
    total_apartment_area: data.totalApartmentArea,
    pdf_file_url: data.pdfFileUrl,
    dwg_file_url: data.dwgFileUrl,
    created_at: data.createdAt,
  };
}

function transformApartmentInput(data: Partial<Apartment>): any {
  const input: any = {};

  if (data.apartment_number !== undefined) input.apartmentNumber = data.apartment_number;
  if (data.floor !== undefined) input.floor = data.floor;
  if (data.apartment_area !== undefined) input.apartmentArea = data.apartment_area;
  if (data.storage_area !== undefined) input.storageArea = data.storage_area;
  if (data.pergola_area !== undefined) input.pergolaArea = data.pergola_area;
  if (data.balcony_area !== undefined) input.balconyArea = data.balcony_area;
  if (data.garden_area !== undefined) input.gardenArea = data.garden_area;
  if (data.total_apartment_area !== undefined) input.totalApartmentArea = data.total_apartment_area;
  if (data.pdf_file_url !== undefined) input.pdfFileUrl = data.pdf_file_url;
  if (data.dwg_file_url !== undefined) input.dwgFileUrl = data.dwg_file_url;

  return input;
}

export const api = {
  buildings: {
    getAll: async (): Promise<Building[]> => {
      const data: any = await client.request(GET_BUILDINGS);
      return data.buildings.map(transformBuilding);
    },
    getOne: async (id: string): Promise<Building> => {
      const data: any = await client.request(GET_BUILDING, { id });
      return transformBuilding(data.building);
    },
    create: async (input: Omit<Building, 'id' | 'created_at'>): Promise<Building> => {
      throw new Error('Not implemented');
    },
    update: async (id: string, input: Partial<Building>): Promise<Building> => {
      throw new Error('Not implemented');
    },
    delete: async (id: string): Promise<{ message: string }> => {
      throw new Error('Not implemented');
    },
  },
  apartments: {
    getAll: async (buildingId?: string): Promise<Apartment[]> => {
      const data: any = await client.request(GET_APARTMENTS, { buildingId });
      return data.apartments.map(transformApartment);
    },
    getOne: async (id: string): Promise<Apartment> => {
      const data: any = await client.request(GET_APARTMENT, { id });
      return transformApartment(data.apartment);
    },
    create: async (input: Omit<Apartment, 'id' | 'created_at'>): Promise<Apartment> => {
      throw new Error('Not implemented');
    },
    update: async (id: string, input: Partial<Apartment>): Promise<Apartment> => {
      const transformedInput = transformApartmentInput(input);
      const data: any = await client.request(UPDATE_APARTMENT, { id, input: transformedInput });
      return transformApartment(data.updateApartment);
    },
    delete: async (id: string): Promise<{ message: string }> => {
      throw new Error('Not implemented');
    },
  },
};
