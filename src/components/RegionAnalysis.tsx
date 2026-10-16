import { useMemo, useState, useRef, useEffect } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ProcessedCampaignData } from '../types/campaign';

interface RegionAnalysisProps {
  data: ProcessedCampaignData[];
}

interface CityData {
  cidade: string;
  impressoes: number;
  litoranea: boolean;
}

type DonutMode = 'litoral' | 'cidades';

const LITORAL_COLOR = '#0ea5e9';
const NAO_LITORAL_COLOR = '#f59e0b';
const NAO_IDENTIFICADA_COLOR = '#9ca3af';
const COMPARE_COLORS = ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6'];
const MAX_COMPARE_CITIES = COMPARE_COLORS.length;
const BAR_ROW_HEIGHT = 28;

/**
 * Normaliza nome de cidade para comparação (sem acentos, minúsculo)
 */
const normalizeCity = (cidade: string): string =>
  cidade
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

// Municípios litorâneos do estado de São Paulo
const CIDADES_LITORANEAS = new Set(
  [
    'Ubatuba', 'Caraguatatuba', 'Ilhabela', 'São Sebastião', // Litoral Norte
    'Bertioga', 'Guarujá', 'Santos', 'Cubatão', 'São Vicente', 'Praia Grande', 'Mongaguá', 'Itanhaém', 'Peruíbe', // Baixada Santista
    'Iguape', 'Ilha Comprida', 'Cananéia' // Litoral Sul
  ].map(normalizeCity)
);

const isNaoIdentificada = (cidade: string): boolean => {
  const normalized = normalizeCity(cidade);
  return normalized === '' || normalized === 'n/a' || normalized === 'na';
};

const isLitoranea = (cidade: string): boolean => CIDADES_LITORANEAS.has(normalizeCity(cidade));

const formatNumber = (num: number): string => {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(2)} mi`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)} mil`;
  }
  return num.toFixed(0);
};

const formatFull = (num: number): string => num.toLocaleString('pt-BR');

const RegionAnalysis = ({ data }: RegionAnalysisProps) => {
  const [donutMode, setDonutMode] = useState<DonutMode>('litoral');
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [isCityPickerOpen, setIsCityPickerOpen] = useState(false);
  const [citySearch, setCitySearch] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);

  // Fecha o seletor de cidades ao clicar fora
  useEffect(() => {
    if (!isCityPickerOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsCityPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isCityPickerOpen]);

  // Agrega impressões por cidade
  const { cities, naoIdentificadaImpressoes } = useMemo(() => {
    const cityMap = new Map<string, number>();
    let naoIdentificada = 0;

    data.forEach(item => {
      const cidade = item.regiao || '';
      if (isNaoIdentificada(cidade)) {
        naoIdentificada += item.impressions;
        return;
      }
      cityMap.set(cidade, (cityMap.get(cidade) || 0) + item.impressions);
    });

    const citiesArray: CityData[] = Array.from(cityMap.entries())
      .map(([cidade, impressoes]) => ({ cidade, impressoes, litoranea: isLitoranea(cidade) }))
      .filter(city => city.impressoes > 0)
      .sort((a, b) => b.impressoes - a.impressoes);

    return { cities: citiesArray, naoIdentificadaImpressoes: naoIdentificada };
  }, [data]);

  // Remove cidades selecionadas que não existem mais nos dados filtrados
  useEffect(() => {
    setSelectedCities(prev => {
      const available = new Set(cities.map(c => c.cidade));
      const next = prev.filter(c => available.has(c));
      return next.length === prev.length ? prev : next;
    });
  }, [cities]);

  // Ao entrar no modo de comparação sem seleção, sugere a maior cidade litorânea e a maior não litorânea
  const handleModeChange = (mode: DonutMode) => {
    setDonutMode(mode);
    if (mode === 'cidades' && selectedCities.length === 0) {
      const topLitoral = cities.find(c => c.litoranea);
      const topNaoLitoral = cities.find(c => !c.litoranea);
      setSelectedCities([topLitoral, topNaoLitoral].filter(Boolean).map(c => c!.cidade));
    }
  };

  const toggleCity = (cidade: string) => {
    setSelectedCities(prev => {
      if (prev.includes(cidade)) return prev.filter(c => c !== cidade);
      if (prev.length >= MAX_COMPARE_CITIES) return prev;
      return [...prev, cidade];
    });
  };

  const donutData = useMemo(() => {
    if (donutMode === 'litoral') {
      const litoral = cities.filter(c => c.litoranea).reduce((sum, c) => sum + c.impressoes, 0);
      const naoLitoral = cities.filter(c => !c.litoranea).reduce((sum, c) => sum + c.impressoes, 0);
      return [
        { name: 'Cidades litorâneas', value: litoral, color: LITORAL_COLOR },
        { name: 'Cidades não litorâneas', value: naoLitoral, color: NAO_LITORAL_COLOR },
        { name: 'Não identificada', value: naoIdentificadaImpressoes, color: NAO_IDENTIFICADA_COLOR }
      ].filter(item => item.value > 0);
    }

    const cityByName = new Map(cities.map(c => [c.cidade, c]));
    return selectedCities
      .map((cidade, index) => ({
        name: cidade,
        value: cityByName.get(cidade)?.impressoes || 0,
        color: COMPARE_COLORS[index % COMPARE_COLORS.length]
      }))
      .filter(item => item.value > 0);
  }, [donutMode, cities, selectedCities, naoIdentificadaImpressoes]);

  const donutTotal = donutData.reduce((sum, item) => sum + item.value, 0);

  const filteredCityOptions = useMemo(() => {
    const query = normalizeCity(citySearch);
    if (!query) return cities;
    return cities.filter(c => normalizeCity(c.cidade).includes(query));
  }, [cities, citySearch]);

  if (cities.length === 0 && naoIdentificadaImpressoes === 0) {
    return (
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Entrega por Região</h2>
        <p className="text-sm text-gray-500 py-8 text-center">Nenhum dado de região disponível para o período selecionado</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-1">Entrega por Região</h2>
      <p className="text-xs text-gray-500 mb-6">Volume de impressões por cidade</p>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Gráfico de rosca */}
        <div className="lg:col-span-5 border border-gray-200 rounded-lg p-4 flex flex-col">
          <div className="flex flex-col gap-3 mb-4">
            <h3 className="text-sm font-semibold text-gray-700">
              {donutMode === 'litoral' ? 'Litorâneas × Não litorâneas' : 'Comparação entre cidades'}
            </h3>

            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 self-start">
              <button
                onClick={() => handleModeChange('litoral')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
                  donutMode === 'litoral' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Litoral × Não litoral
              </button>
              <button
                onClick={() => handleModeChange('cidades')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
                  donutMode === 'cidades' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Comparar cidades
              </button>
            </div>

            {donutMode === 'cidades' && (
              <div className="relative" ref={pickerRef}>
                <button
                  onClick={() => setIsCityPickerOpen(open => !open)}
                  className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <span>
                    {selectedCities.length === 0
                      ? 'Selecione as cidades'
                      : `${selectedCities.length} cidade${selectedCities.length > 1 ? 's' : ''} selecionada${selectedCities.length > 1 ? 's' : ''}`}
                  </span>
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isCityPickerOpen && (
                  <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
                    <div className="p-2 border-b border-gray-100">
                      <input
                        type="text"
                        value={citySearch}
                        onChange={(e) => setCitySearch(e.target.value)}
                        placeholder="Buscar cidade..."
                        autoFocus
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <p className="text-[11px] text-gray-400 mt-1">Até {MAX_COMPARE_CITIES} cidades</p>
                    </div>
                    <ul className="max-h-60 overflow-y-auto py-1">
                      {filteredCityOptions.map(city => {
                        const checked = selectedCities.includes(city.cidade);
                        const disabled = !checked && selectedCities.length >= MAX_COMPARE_CITIES;
                        return (
                          <li key={city.cidade}>
                            <label
                              className={`flex items-center gap-2 px-3 py-1.5 text-sm ${
                                disabled ? 'text-gray-300 cursor-not-allowed' : 'text-gray-700 hover:bg-blue-50 cursor-pointer'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={disabled}
                                onChange={() => toggleCity(city.cidade)}
                                className="rounded border-gray-300"
                              />
                              <span className="flex-1 truncate">{city.cidade}</span>
                              {city.litoranea && (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-sky-50 text-sky-700">litoral</span>
                              )}
                              <span className="text-xs text-gray-400">{formatNumber(city.impressoes)}</span>
                            </label>
                          </li>
                        );
                      })}
                      {filteredCityOptions.length === 0 && (
                        <li className="px-3 py-2 text-sm text-gray-400">Nenhuma cidade encontrada</li>
                      )}
                    </ul>
                  </div>
                )}

                {selectedCities.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {selectedCities.map((cidade, index) => (
                      <span
                        key={cidade}
                        className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700"
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COMPARE_COLORS[index % COMPARE_COLORS.length] }} />
                        {cidade}
                        <button
                          onClick={() => toggleCity(cidade)}
                          className="ml-0.5 w-4 h-4 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                          aria-label={`Remover ${cidade}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {donutData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-12 text-sm text-gray-400">
              Selecione ao menos uma cidade para comparar
            </div>
          ) : (
            <>
              <div className="relative h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="62%"
                      outerRadius="90%"
                      paddingAngle={donutData.length > 1 ? 2 : 0}
                      stroke="#fff"
                      strokeWidth={2}
                    >
                      {donutData.map(entry => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => {
                        const num = Number(value);
                        const pct = donutTotal > 0 ? (num / donutTotal) * 100 : 0;
                        return [`${formatFull(num)} (${pct.toFixed(1)}%)`, 'Impressões'];
                      }}
                      contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xl font-bold text-gray-900">{formatNumber(donutTotal)}</span>
                  <span className="text-xs text-gray-500">impressões</span>
                </div>
              </div>

              <ul className="mt-4 space-y-2">
                {donutData.map(item => {
                  const pct = donutTotal > 0 ? (item.value / donutTotal) * 100 : 0;
                  return (
                    <li key={item.name} className="flex items-center gap-2 text-sm">
                      <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="flex-1 text-gray-700 truncate" title={item.name}>{item.name}</span>
                      <span className="text-gray-900 font-medium tabular-nums">{formatFull(item.value)}</span>
                      <span className="w-14 text-right text-gray-500 tabular-nums">{pct.toFixed(1)}%</span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        {/* Gráfico de barras - ranking de cidades */}
        <div className="lg:col-span-7 border border-gray-200 rounded-lg p-4 flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <h3 className="text-sm font-semibold text-gray-700">
              Ranking de cidades por impressões
              <span className="ml-2 text-xs font-normal text-gray-400">{cities.length} cidades</span>
            </h3>
            <div className="flex items-center gap-3 text-xs text-gray-600">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: LITORAL_COLOR }} />
                Litorânea
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: NAO_LITORAL_COLOR }} />
                Não litorânea
              </span>
            </div>
          </div>

          <div className="max-h-[520px] overflow-y-auto pr-1">
            <div style={{ height: Math.max(cities.length * BAR_ROW_HEIGHT + 40, 200) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cities} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                  <XAxis
                    type="number"
                    orientation="top"
                    tickFormatter={formatNumber}
                    tick={{ fill: '#6b7280', fontSize: 11 }}
                    stroke="#9ca3af"
                  />
                  <YAxis
                    type="category"
                    dataKey="cidade"
                    width={150}
                    interval={0}
                    tick={{ fill: '#374151', fontSize: 12 }}
                    stroke="#9ca3af"
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(14, 165, 233, 0.08)' }}
                    formatter={(value) => [formatFull(Number(value)), 'Impressões']}
                    contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }}
                  />
                  <Bar
                    dataKey="impressoes"
                    radius={[0, 4, 4, 0]}
                    barSize={18}
                    label={{ position: 'right', fill: '#6b7280', fontSize: 11, formatter: (v: unknown) => formatNumber(Number(v)) }}
                  >
                    {cities.map(city => (
                      <Cell key={city.cidade} fill={city.litoranea ? LITORAL_COLOR : NAO_LITORAL_COLOR} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {naoIdentificadaImpressoes > 0 && (
            <p className="mt-3 text-xs text-gray-400">
              {formatFull(naoIdentificadaImpressoes)} impressões sem cidade identificada (N/A) não entram no ranking.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default RegionAnalysis;
