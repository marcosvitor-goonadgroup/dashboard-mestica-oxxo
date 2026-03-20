import axios from 'axios';
import { ApiResponse, ProcessedCampaignData, PricingTableRow } from '../types/campaign';
import { parse } from 'date-fns';

const API_URLS = [
  'https://nmbcoamazonia-api.vercel.app/google/sheets/1rTvj1iAUUbxLOaI_tcxQKril4P9Glw-8YfRL_23_sds/data?range=Moovit'
];

const PRICING_API_URL = 'https://nmbcoamazonia-api.vercel.app/google/sheets/1zgRBEs_qi_9DdYLqw-cEedD1u66FS88ku6zTZ0gV-oU/data?range=base';

const PI_INFO_BASE_URL = 'https://nmbcoamazonia-api.vercel.app/google/sheets/1T35Pzw9ZA5NOTLHsTqMGZL5IEedpSGdZHJ2ElrqLs1M/data';
const PI_INFO_API_URL = `${PI_INFO_BASE_URL}?range=base`;
const PI_INFO_REPRESENTACAO_URL = `${PI_INFO_BASE_URL}?range=representacao`;

const parseNumber = (value: string): number => {
  if (!value || value === '') return 0;
  const cleaned = value.replace(/\./g, '').replace(',', '.');
  return parseFloat(cleaned) || 0;
};

const parseCurrency = (value: string): number => {
  if (!value || value === '') return 0;
  // Remove "R$" e espaços, depois processa como número
  const cleaned = value.replace('R$', '').trim().replace(/\./g, '').replace(',', '.');
  return parseFloat(cleaned) || 0;
};

const parsePercentage = (value: string): number => {
  if (!value || value === '') return 0;
  // Remove "%" e converte para decimal
  const cleaned = value.replace('%', '').trim().replace(',', '.');
  return parseFloat(cleaned) || 0;
};

const parseDate = (dateString: string): Date => {
  if (!dateString || dateString === '') return new Date();
  try {
    // Formato D/M/YYYY (ex: 9/2/2026 = dia 9, mês 2)
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateString)) {
      return parse(dateString, 'd/M/yyyy', new Date());
    }
    // Formato DD/MM/YYYY
    return parse(dateString, 'dd/MM/yyyy', new Date());
  } catch {
    return new Date();
  }
};


const normalizeVeiculo = (veiculo: string): string => {
  const normalized = veiculo.trim();
  if (normalized === 'Audience Network' || normalized === 'Messenger') {
    return 'Facebook';
  }
  return normalized;
};

export const fetchCampaignData = async (): Promise<ProcessedCampaignData[]> => {
  try {
    const responses = await Promise.all(
      API_URLS.map(url => axios.get<ApiResponse>(url))
    );

    const allData: ProcessedCampaignData[] = [];

    responses.forEach((response, apiIndex) => {
      const apiUrl = API_URLS[apiIndex];
      console.log(`Processando API ${apiIndex + 1}: ${apiUrl}`);

      if (response.data.success && response.data.data.values.length > 1) {
        // Pula a linha de header (índice 0)
        const rows = response.data.data.values.slice(1);

        rows.forEach(row => {
          // Estrutura Oxxo/Moovit:
          // [0]=o [1]=ID Conta [2]=Data [3]=Device [4]=Campaign Name [5]=Campaign ID
          // [6]=Ad Group Name [7]=Ad group ID [8]=Ad Name [9]=Ad ID [10]=Ad Final URL
          // [11]=Cost(Spend) [12]=Impressions [13]=Clicks [14]=Views 10% [15]=Views 50%
          // [16]=Views 75% [17]=Views 100% [18]=VA [19]=Agência [20]=Veículo
          // [21]=Número PI [22]=Tipo de Compra [23]=Investimento [24]=Formato [25]=Campanha
          if (row.length >= 14) {
            const veiculoRaw = row[20] || '';
            const veiculo = normalizeVeiculo(veiculoRaw);

            const dataRow: ProcessedCampaignData = {
              date: parseDate(row[2]),
              campaignName: row[4] || '',
              adSetName: row[6] || '',
              adName: row[8] || '',
              cost: parseCurrency(row[23]),
              impressions: parseNumber(row[12]),
              reach: 0,
              clicks: parseNumber(row[13]),
              videoViews: parseNumber(row[14]),
              videoViews25: 0,
              videoViews50: parseNumber(row[15]),
              videoViews75: parseNumber(row[16]),
              videoCompletions: parseNumber(row[17]),
              totalEngagements: 0,
              veiculo: veiculo,
              tipoDeCompra: row[22] || '',
              videoEstaticoAudio: row[24] || '',
              viewability: 0,
              campanha: row[25] || '',
              numeroPi: row[21] || ''
            };
            allData.push(dataRow);
          }
        });
      }
    });

    return allData;
  } catch (error) {
    console.error('Erro ao buscar dados das campanhas:', error);
    throw error;
  }
};


export const fetchPricingTable = async (): Promise<PricingTableRow[]> => {
  try {
    const response = await axios.get<ApiResponse>(PRICING_API_URL);

    if (response.data.success && response.data.data.values.length > 1) {
      const rows = response.data.data.values.slice(1); // Pula o header

      const pricingData: PricingTableRow[] = rows.map(row => ({
        veiculo: row[0] || '',
        canal: row[1] || '',
        formato: row[2] || '',
        tipoDeCompra: row[3] || '',
        valorUnitario: parseCurrency(row[4]),
        desconto: parsePercentage(row[5]),
        valorFinal: parseCurrency(row[6])
      }));

      return pricingData;
    }

    return [];
  } catch (error) {
    console.error('Erro ao buscar tabela de preços:', error);
    throw error;
  }
};


/**
 * Busca informações de um PI específico (nas abas "base" e "representacao")
 */
export const fetchPIInfo = async (numeroPi: string) => {
  try {
    const normalizedPi = numeroPi.replace(/^0+/, '').replace(/\./g, '').replace(',', '.');

    const [baseRes, reprRes] = await Promise.allSettled([
      axios.get(PI_INFO_API_URL),
      axios.get(PI_INFO_REPRESENTACAO_URL)
    ]);

    const piInfo: ReturnType<typeof mapBaseRow>[] = [];

    // Aba "base"
    if (baseRes.status === 'fulfilled' && baseRes.value.data.success && baseRes.value.data.data.values) {
      const rows: string[][] = baseRes.value.data.data.values.slice(1);
      rows
        .filter(row => (row[0] || '').replace(/^0+/, '').replace(/\./g, '').replace(',', '.') === normalizedPi)
        .forEach(row => piInfo.push(mapBaseRow(row)));
    }

    // Aba "representacao"
    if (reprRes.status === 'fulfilled' && reprRes.value.data.success && reprRes.value.data.data.values) {
      const rows: string[][] = reprRes.value.data.data.values.slice(1);
      rows
        .filter(row => (row[2] || '').replace(/^0+/, '').replace(/\./g, '').replace(',', '.') === normalizedPi)
        .forEach(row => piInfo.push(mapRepresentacaoRow(row)));
    }

    return piInfo.length > 0 ? piInfo : null;
  } catch (error) {
    console.error('Erro ao buscar informações do PI:', error);
    return null;
  }
};

const mapBaseRow = (row: string[]) => ({
  numeroPi: row[0] || '',
  veiculo: row[1] || '',
  canal: row[2] || '',
  formato: row[3] || '',
  modeloCompra: row[4] || '',
  valorNegociado: row[7] || '',
  quantidade: row[8] || '',
  totalBruto: row[9] || '',
  status: row[11] || '',
  segmentacao: row[12] || '',
  alcance: row[13] || '',
  inicio: row[14] || '',
  fim: row[15] || '',
  publico: row[16] || '',
  praca: row[17] || '',
  objetivo: row[18] || ''
});

const mapRepresentacaoRow = (row: string[]) => ({
  numeroPi: row[2] || '',
  veiculo: row[3] || '',        // Veículo
  canal: '',
  formato: row[4] || '',        // Formato
  modeloCompra: row[5] || '',   // Modelos (CPM, CPC...)
  valorNegociado: row[12] || '', // Valor Unitário Desc.
  quantidade: row[10] || '',    // Volume
  totalBruto: row[14] || '',    // Bruto Negociado
  status: '',
  segmentacao: row[6] || '',    // Segmentação
  alcance: row[7] || '',        // Alcance
  inicio: row[8] || '',         // Início
  fim: row[9] || '',            // Fim
  publico: '',
  praca: row[15] || '',         // Praça
  objetivo: row[16] || ''       // Objetivo
});

