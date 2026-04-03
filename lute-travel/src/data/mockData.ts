import { Guide, Driver, DailyTourSlot, Order } from '../types'

export const MOCK_GUIDES: Guide[] = [
  { id: 'g1', name: '吳書華', englishName: 'Sophie Wu',  phone: '+886-930-888-041', preferredLanguages: ['英語', '中文'], incompatibleDrivers: [] },
  { id: 'g2', name: '林君照', englishName: 'Tommy',      phone: '+886-919-383-799', preferredLanguages: ['英語', '中文'], incompatibleDrivers: [] },
  { id: 'g3', name: '巫睿霖', englishName: 'James',      phone: '+886-986-158-000', preferredLanguages: ['英語'],         incompatibleDrivers: [] },
  { id: 'g4', name: '張芳慈', englishName: 'Cindy',      phone: '+886-916-400-074', preferredLanguages: ['中文'],         incompatibleDrivers: ['d_weian'] },
  { id: 'g5', name: '侯杏宜', englishName: 'Sonia',      phone: '+886-963-007-665', preferredLanguages: ['英語', '中文'], incompatibleDrivers: [] },
]

export const MOCK_DRIVERS: Driver[] = [
  { id: 'd1',       name: '王大明', phone: '+886-912-000-001', licensePlate: 'ABC-1234', vehicleType: '大巴' },
  { id: 'd2',       name: '陳小龍', phone: '+886-912-000-002', licensePlate: 'DEF-5678', vehicleType: '中巴' },
  { id: 'd_weian',  name: '偉安',   phone: '+886-912-000-003', licensePlate: 'GHI-9012', vehicleType: '小巴' },
  { id: 'd4',       name: '李俊輝', phone: '+886-912-000-004', licensePlate: 'JKL-3456', vehicleType: 'VAN'  },
]

export const MOCK_SLOTS: DailyTourSlot[] = [
  {
    id: 's1', date: '2026-04-03', productCode: '09:45 野十黃九', language: '英語',
    pax: 11, adults: 10, infants: 1, guideId: 'g1', driverId: 'd1',
    guideFee: 2800, driverFee: 5500, insuranceCost: 210, platformRevenue: 4935, cashRevenue: 0, miscExpense: 0,
  },
  {
    id: 's2', date: '2026-04-03', productCode: '08:15 野九十十', language: '英語',
    pax: 4, adults: 4, infants: 0, guideId: 'g2', driverId: 'd4',
    guideFee: 2200, driverFee: 2000, insuranceCost: 84, platformRevenue: 2800, cashRevenue: 500, miscExpense: 0,
  },
  {
    id: 's3', date: '2026-04-05', productCode: '06:45 日月潭一日遊', language: '日文',
    pax: 8, adults: 8, infants: 0, guideId: 'g5', driverId: 'd2',
    guideFee: 3000, driverFee: 4500, insuranceCost: 168, platformRevenue: 7200, cashRevenue: 0, miscExpense: 200,
  },
  {
    id: 's4', date: '2026-04-07', productCode: '09:45 野十黃九', language: '英語',
    pax: 14, adults: 13, infants: 1, guideId: 'g3', driverId: 'd1',
    guideFee: 2800, driverFee: 5500, insuranceCost: 273, platformRevenue: 6300, cashRevenue: 1200, miscExpense: 0,
  },
  {
    id: 's5', date: '2026-04-07', productCode: '11:15 野十夜九份', language: '中文',
    pax: 6, adults: 6, infants: 0, guideId: 'g4', driverId: 'd2',
    guideFee: 2000, driverFee: 3500, insuranceCost: 126, platformRevenue: 4200, cashRevenue: 300, miscExpense: 0,
  },
  {
    id: 's6', date: '2026-04-10', productCode: '08:15 野九十十', language: '英語',
    pax: 9, adults: 9, infants: 0, guideId: undefined, driverId: 'd4',
    guideFee: 0, driverFee: 3000, insuranceCost: 189, platformRevenue: 6300, cashRevenue: 0, miscExpense: 0,
  },
  {
    id: 's7', date: '2026-04-12', productCode: '09:00 台中一日遊', language: '英語',
    pax: 18, adults: 17, infants: 1, guideId: 'g1', driverId: 'd1',
    guideFee: 3000, driverFee: 5500, insuranceCost: 357, platformRevenue: 9000, cashRevenue: 600, miscExpense: 300,
  },
  {
    id: 's8', date: '2026-04-14', productCode: '太魯閣一日遊', language: '英語',
    pax: 12, adults: 11, infants: 1, guideId: 'g2', driverId: 'd2',
    guideFee: 3500, driverFee: 5000, insuranceCost: 231, platformRevenue: 8400, cashRevenue: 0, miscExpense: 500,
  },
  {
    id: 's9', date: '2026-04-15', productCode: '09:45 野十黃九', language: '英語',
    pax: 5, adults: 5, infants: 0, guideId: 'g5', driverId: 'd4',
    guideFee: 2200, driverFee: 2000, insuranceCost: 105, platformRevenue: 3500, cashRevenue: 0, miscExpense: 0,
  },
  {
    id: 's10', date: '2026-04-18', productCode: '06:45 日月潭一日遊', language: '中文',
    pax: 22, adults: 20, infants: 2, guideId: 'g4', driverId: 'd_weian',
    guideFee: 2800, driverFee: 4000, insuranceCost: 420, platformRevenue: 11000, cashRevenue: 2000, miscExpense: 0,
  },
  {
    id: 's11', date: '2026-04-20', productCode: '09:45 野十黃九', language: '英語',
    pax: 7, adults: 7, infants: 0, guideId: 'g3', driverId: 'd1',
    guideFee: 2500, driverFee: 5500, insuranceCost: 147, platformRevenue: 4900, cashRevenue: 500, miscExpense: 0,
  },
  {
    id: 's12', date: '2026-04-22', productCode: '08:30 烏來一日遊', language: '日文',
    pax: 10, adults: 10, infants: 0, guideId: 'g5', driverId: 'd2',
    guideFee: 2800, driverFee: 4000, insuranceCost: 210, platformRevenue: 7000, cashRevenue: 0, miscExpense: 100,
  },
  {
    id: 's13', date: '2026-04-25', productCode: '09:45 野十黃九', language: '英語',
    pax: 16, adults: 15, infants: 1, guideId: 'g2', driverId: 'd1',
    guideFee: 2800, driverFee: 5500, insuranceCost: 315, platformRevenue: 8000, cashRevenue: 1000, miscExpense: 0,
  },
  {
    id: 's14', date: '2026-04-28', productCode: '11:15 野十夜九份', language: '英語',
    pax: 3, adults: 3, infants: 0, guideId: undefined, driverId: undefined,
    guideFee: 0, driverFee: 0, insuranceCost: 63, platformRevenue: 2100, cashRevenue: 0, miscExpense: 0,
  },
]

export const MOCK_ORDERS: Order[] = [
  {
    id: 'ord1',
    bookingRef: 'AWB862233',
    orderDate: '2026-04-03',
    tourDate: '2026-04-03',
    productCode: '09:45 野十黃九',
    totalPax: 11, adults: 10, infants: 1,
    platform: 'KLOOK', platformRevenue: 4935, cashRevenue: 0,
    language: '英語', status: 'active',
    meetingTime: '09:45', representativeName: 'CECILE MEJARES',
    phone: '63-9228220719', email: 'cecilemejares@yahoo.com',
    passengers: [
      { id: 'p1',  orderRef: 'AWB862233=01/11', sequenceNo: 1,  passportName: 'CECILE MEJARES',        dateOfBirth: '1979-07-19', passportNo: 'P3441569B', nationality: 'Philippines', isRepresentative: true  },
      { id: 'p2',  orderRef: 'AWB862233=02/11', sequenceNo: 2,  passportName: 'MICHAEL CATOLOS',       dateOfBirth: '1981-02-03', passportNo: 'P7063070A', nationality: 'Philippines', isRepresentative: false },
      { id: 'p3',  orderRef: 'AWB862233=03/11', sequenceNo: 3,  passportName: 'LIZA CATOLOS',          dateOfBirth: '1979-10-08', passportNo: 'P7070933A', nationality: 'Philippines', isRepresentative: false },
      { id: 'p4',  orderRef: 'AWB862233=04/11', sequenceNo: 4,  passportName: 'MIKKO GABRIEL CATOLOS', dateOfBirth: '2019-03-08', passportNo: 'P6214894C', nationality: 'Philippines', isRepresentative: false },
      { id: 'p5',  orderRef: 'AWB862233=05/11', sequenceNo: 5,  passportName: 'DARREN TORRES',         dateOfBirth: '1984-01-06', passportNo: 'P2115633C', nationality: 'Philippines', isRepresentative: false },
      { id: 'p6',  orderRef: 'AWB862233=06/11', sequenceNo: 6,  passportName: 'SHERRY LYN TORRES',     dateOfBirth: '1983-07-24', passportNo: 'P2112666C', nationality: 'Philippines', isRepresentative: false },
      { id: 'p7',  orderRef: 'AWB862233=07/11', sequenceNo: 7,  passportName: 'DARLENE SHANE TORRES',  dateOfBirth: '2011-10-23', passportNo: 'P2112318C', nationality: 'Philippines', isRepresentative: false },
      { id: 'p8',  orderRef: 'AWB862233=08/11', sequenceNo: 8,  passportName: 'FAITH SHERLYN TORRES',  dateOfBirth: '2013-01-22', passportNo: 'P2112657C', nationality: 'Philippines', isRepresentative: false },
      { id: 'p9',  orderRef: 'AWB862233=09/11', sequenceNo: 9,  passportName: 'ROWEL MEJARES',         dateOfBirth: '1978-02-10', passportNo: 'P6130879C', nationality: 'Philippines', isRepresentative: false },
      { id: 'p10', orderRef: 'AWB862233=10/11', sequenceNo: 10, passportName: 'LANCE ANGELO MEJARES',  dateOfBirth: '2003-09-10', passportNo: 'P6130878C', nationality: 'Philippines', isRepresentative: false },
      { id: 'p11', orderRef: 'AWB862233=11/11', sequenceNo: 11, passportName: 'ELLISE HOPE TORRES',    dateOfBirth: '2023-07-01', passportNo: 'P5706538C', nationality: 'Philippines', isRepresentative: false },
    ],
  },
  {
    id: 'ord2', bookingRef: 'VTR-2026040301', orderDate: '2026-04-01', tourDate: '2026-04-03',
    productCode: '08:15 野九十十', totalPax: 4, adults: 4, infants: 0,
    platform: 'VIATOR', platformRevenue: 2800, cashRevenue: 500, language: '英語', status: 'active',
    meetingTime: '08:15', representativeName: 'JOHN SMITH', phone: '1-5551234567',
    passengers: [
      { id: 'q1', orderRef: 'VTR-2026040301=01/04', sequenceNo: 1, passportName: 'JOHN SMITH',  dateOfBirth: '1985-06-15', passportNo: 'US1234567', nationality: 'USA', isRepresentative: true  },
      { id: 'q2', orderRef: 'VTR-2026040301=02/04', sequenceNo: 2, passportName: 'MARY SMITH',  dateOfBirth: '1987-09-22', passportNo: 'US7654321', nationality: 'USA', isRepresentative: false },
      { id: 'q3', orderRef: 'VTR-2026040301=03/04', sequenceNo: 3, passportName: 'TOM SMITH',   dateOfBirth: '2010-03-10', passportNo: 'US1111111', nationality: 'USA', isRepresentative: false },
      { id: 'q4', orderRef: 'VTR-2026040301=04/04', sequenceNo: 4, passportName: 'SARAH SMITH', dateOfBirth: '2013-07-18', passportNo: 'US2222222', nationality: 'USA', isRepresentative: false },
    ],
  },
  {
    id: 'ord3', bookingRef: 'TRP-JP-20260405', orderDate: '2026-03-28', tourDate: '2026-04-05',
    productCode: '06:45 日月潭一日遊', totalPax: 2, adults: 2, infants: 0,
    platform: 'TRIP', platformRevenue: 3600, cashRevenue: 0, language: '日文', status: 'active',
    meetingTime: '06:45', representativeName: 'TANAKA HIROSHI', phone: '81-9012345678',
    passengers: [
      { id: 'r1', orderRef: 'TRP-JP-20260405=01/02', sequenceNo: 1, passportName: 'TANAKA HIROSHI', dateOfBirth: '1990-04-20', passportNo: 'TK1234567', nationality: 'Japan', isRepresentative: true  },
      { id: 'r2', orderRef: 'TRP-JP-20260405=02/02', sequenceNo: 2, passportName: 'TANAKA YUKI',   dateOfBirth: '1992-11-03', passportNo: 'TK7654321', nationality: 'Japan', isRepresentative: false },
    ],
  },
]
