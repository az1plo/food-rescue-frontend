export interface BusinessAnalyticsOverviewModel {
  totalOffers: number;
  availableOffers: number;
  offersClaimed: number;
  activeReservations: number;
  completedPickups: number;
  cancelledReservations: number;
  recoveredRevenue: number;
  pendingReservedRevenue: number;
  offerClaimRate: number;
  pickupSuccessRate: number;
  cancellationRate: number;
  averageHoursToFirstReservation: number | null;
}

export interface BusinessAnalyticsCatalogStatusModel {
  status: string;
  count: number;
  share: number;
}

export interface BusinessAnalyticsDailyActivityPointModel {
  date: string;
  offersPublished: number;
  reservationsCreated: number;
  cancellations: number;
  pickupsConfirmed: number;
}

export interface BusinessAnalyticsDaypartPerformanceModel {
  slotKey: string;
  label: string;
  offersScheduled: number;
  offersClaimed: number;
  pickupsConfirmed: number;
  recoveredRevenue: number;
  claimRate: number;
  pickupRate: number;
}

export interface BusinessAnalyticsItemPerformanceModel {
  itemName: string;
  offeredQuantity: number;
  reservedQuantity: number;
  pickedUpQuantity: number;
}

export interface BusinessAnalyticsInsightModel {
  tone: 'success' | 'warning' | 'info';
  title: string;
  message: string;
}

export interface BusinessAnalyticsModel {
  businessId: number;
  businessName: string;
  generatedAt: string;
  overview: BusinessAnalyticsOverviewModel;
  catalogStatus: BusinessAnalyticsCatalogStatusModel[];
  dailyActivity: BusinessAnalyticsDailyActivityPointModel[];
  daypartPerformance: BusinessAnalyticsDaypartPerformanceModel[];
  topItems: BusinessAnalyticsItemPerformanceModel[];
  insights: BusinessAnalyticsInsightModel[];
}
