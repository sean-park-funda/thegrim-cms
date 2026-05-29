'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store/useStore';
import { canViewSales } from '@/lib/utils/permissions';
import { getSlugByWorkName, fetchAllTitlesFromDB, TEAM_LABELS, TeamLabel, TitleMasterInfo } from '@/lib/sales/title-master-data';
import { useSidebar } from '@/components/ui/sidebar';
import { Menu, Search, ChevronDown } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { WORK_COLORS, fmtShort, DailySalesData, dateStr, normalizeSalesData } from '@/lib/sales/types';
import { settlementFetch } from '@/lib/settlement/api';

const fmtComma = (n: number) => n.toLocaleString();
const MARKET_FEE_RATE = 0.1;

function fmtShortComma(n: number) {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만`;
  return n.toLocaleString();
}

function getRsRate(workName: string): number {
  if (workName === '외모지상주의') return 0.7;
  if (workName === '이섭의 연애') return 0.5;
  return 0.6;
}

interface TrackingEntry {
  date: string;
  amount: number;
}

interface TrackedWork {
  name: string;
  launchDate: string;
  entries: TrackingEntry[];
}

const EXCLUDED_FROM_AUTO_TRACKING = new Set([
  '체탐자', '먹뀌싸', '건곤불이기',
]);

const TRACKED_WORKS: TrackedWork[] = [
  {
    name: '개짓',
    launchDate: '2024-10-26',
    entries: [
      { date: '2024-10-26', amount: 1734307 },
      { date: '2024-10-27', amount: 25629381 },
      { date: '2024-10-28', amount: 17502667 },
      { date: '2024-10-29', amount: 12977817 },
      { date: '2024-10-30', amount: 10620207 },
      { date: '2024-10-31', amount: 8332848 },
      { date: '2024-11-01', amount: 6416051 },
      { date: '2024-11-02', amount: 12444403 },
      { date: '2024-11-03', amount: 20339403 },
      { date: '2024-11-04', amount: 8427457 },
      { date: '2024-11-05', amount: 5331783 },
      { date: '2024-11-06', amount: 4367999 },
      { date: '2024-11-07', amount: 3750887 },
      { date: '2024-11-08', amount: 3156917 },
      { date: '2024-11-09', amount: 7687837 },
      { date: '2024-11-10', amount: 17422613 },
      { date: '2024-11-11', amount: 6727450 },
      { date: '2024-11-12', amount: 4555591 },
      { date: '2024-11-13', amount: 3482360 },
      { date: '2024-11-14', amount: 3359371 },
      { date: '2024-11-15', amount: 2744594 },
      { date: '2024-11-16', amount: 6241164 },
      { date: '2024-11-17', amount: 13436432 },
      { date: '2024-11-18', amount: 4723534 },
      { date: '2024-11-19', amount: 2981567 },
      { date: '2024-11-20', amount: 2389255 },
      { date: '2024-11-21', amount: 2159040 },
      { date: '2024-11-22', amount: 1946840 },
    ],
  },
  {
    name: '구룡: 사로카',
    launchDate: '2024-10-28',
    entries: [
      { date: '2024-10-28', amount: 2216692 },
      { date: '2024-10-29', amount: 11634570 },
      { date: '2024-10-30', amount: 4594797 },
      { date: '2024-10-31', amount: 2884636 },
      { date: '2024-11-01', amount: 1986393 },
      { date: '2024-11-02', amount: 1671147 },
      { date: '2024-11-03', amount: 1392079 },
      { date: '2024-11-04', amount: 2928777 },
      { date: '2024-11-05', amount: 6002065 },
      { date: '2024-11-06', amount: 1777547 },
      { date: '2024-11-07', amount: 1164233 },
      { date: '2024-11-08', amount: 867236 },
      { date: '2024-11-09', amount: 660477 },
      { date: '2024-11-10', amount: 615538 },
      { date: '2024-11-11', amount: 2192311 },
      { date: '2024-11-12', amount: 5799459 },
      { date: '2024-11-13', amount: 1661777 },
      { date: '2024-11-14', amount: 978688 },
      { date: '2024-11-15', amount: 780393 },
      { date: '2024-11-16', amount: 644215 },
      { date: '2024-11-17', amount: 521771 },
      { date: '2024-11-18', amount: 2339531 },
      { date: '2024-11-19', amount: 7758038 },
      { date: '2024-11-20', amount: 2009253 },
      { date: '2024-11-21', amount: 1216064 },
      { date: '2024-11-22', amount: 981015 },
      { date: '2024-11-23', amount: 723677 },
      { date: '2024-11-24', amount: 631244 },
    ],
  },
  {
    name: '하이클래스',
    launchDate: '2024-10-30',
    entries: [
      { date: '2024-10-30', amount: 765218 },
      { date: '2024-10-31', amount: 3507170 },
      { date: '2024-11-01', amount: 1169608 },
      { date: '2024-11-02', amount: 742684 },
      { date: '2024-11-03', amount: 459010 },
      { date: '2024-11-04', amount: 453884 },
      { date: '2024-11-05', amount: 399365 },
      { date: '2024-11-06', amount: 1073310 },
      { date: '2024-11-07', amount: 2627004 },
      { date: '2024-11-08', amount: 876567 },
      { date: '2024-11-09', amount: 372860 },
      { date: '2024-11-10', amount: 274213 },
      { date: '2024-11-11', amount: 292544 },
      { date: '2024-11-12', amount: 208840 },
      { date: '2024-11-13', amount: 580924 },
      { date: '2024-11-14', amount: 1992870 },
      { date: '2024-11-15', amount: 519779 },
      { date: '2024-11-16', amount: 262839 },
      { date: '2024-11-17', amount: 194365 },
      { date: '2024-11-18', amount: 152785 },
      { date: '2024-11-19', amount: 148340 },
      { date: '2024-11-20', amount: 536448 },
      { date: '2024-11-21', amount: 2100455 },
      { date: '2024-11-22', amount: 574830 },
      { date: '2024-11-23', amount: 278096 },
      { date: '2024-11-24', amount: 168520 },
      { date: '2024-11-25', amount: 173056 },
      { date: '2024-11-26', amount: 150468 },
    ],
  },
  {
    name: '밤의 방문자',
    launchDate: '2024-10-30',
    entries: [
      { date: '2024-10-30', amount: 1399901 },
      { date: '2024-10-31', amount: 15949127 },
      { date: '2024-11-01', amount: 12738079 },
      { date: '2024-11-02', amount: 15078464 },
      { date: '2024-11-03', amount: 12386105 },
      { date: '2024-11-04', amount: 9234846 },
      { date: '2024-11-05', amount: 7121263 },
      { date: '2024-11-06', amount: 8008228 },
      { date: '2024-11-07', amount: 9029510 },
      { date: '2024-11-08', amount: 6066832 },
      { date: '2024-11-09', amount: 6596931 },
      { date: '2024-11-10', amount: 5995598 },
      { date: '2024-11-11', amount: 4502435 },
      { date: '2024-11-12', amount: 3658334 },
      { date: '2024-11-13', amount: 5431696 },
      { date: '2024-11-14', amount: 8353360 },
      { date: '2024-11-15', amount: 4260195 },
      { date: '2024-11-16', amount: 5198018 },
      { date: '2024-11-17', amount: 4776005 },
      { date: '2024-11-18', amount: 3469754 },
      { date: '2024-11-19', amount: 3092534 },
      { date: '2024-11-20', amount: 4223733 },
      { date: '2024-11-21', amount: 5776925 },
      { date: '2024-11-22', amount: 3394150 },
      { date: '2024-11-23', amount: 3872523 },
      { date: '2024-11-24', amount: 3770924 },
      { date: '2024-11-25', amount: 2517065 },
      { date: '2024-11-26', amount: 2366345 },
    ],
  },
  {
    name: '벤타블랙',
    launchDate: '2024-11-10',
    entries: [
      { date: '2024-11-10', amount: 373700 },
      { date: '2024-11-11', amount: 4818460 },
      { date: '2024-11-12', amount: 2418944 },
      { date: '2024-11-13', amount: 598206 },
      { date: '2024-11-14', amount: 328447 },
      { date: '2024-11-15', amount: 332304 },
      { date: '2024-11-16', amount: 336670 },
      { date: '2024-11-17', amount: 1555507 },
      { date: '2024-11-18', amount: 8799494 },
      { date: '2024-11-19', amount: 2479249 },
      { date: '2024-11-20', amount: 1096662 },
      { date: '2024-11-21', amount: 615560 },
      { date: '2024-11-22', amount: 462980 },
      { date: '2024-11-23', amount: 366016 },
      { date: '2024-11-24', amount: 1505016 },
      { date: '2024-11-25', amount: 6803637 },
      { date: '2024-11-26', amount: 1793979 },
      { date: '2024-11-27', amount: 805792 },
      { date: '2024-11-28', amount: 533955 },
      { date: '2024-11-29', amount: 478995 },
      { date: '2024-11-30', amount: 396596 },
      { date: '2024-12-01', amount: 1238108 },
      { date: '2024-12-02', amount: 4475651 },
      { date: '2024-12-03', amount: 165114 },
      { date: '2024-12-04', amount: 585397 },
      { date: '2024-12-05', amount: 445025 },
      { date: '2024-12-06', amount: 372526 },
      { date: '2024-12-07', amount: 259272 },
    ],
  },
  {
    name: '정의구현',
    launchDate: '2024-11-20',
    entries: [
      { date: '2024-11-20', amount: 722594 },
      { date: '2024-11-21', amount: 5044513 },
      { date: '2024-11-22', amount: 696242 },
      { date: '2024-11-23', amount: 273085 },
      { date: '2024-11-24', amount: 417850 },
      { date: '2024-11-25', amount: 470993 },
      { date: '2024-11-26', amount: 544714 },
      { date: '2024-11-27', amount: 1905250 },
      { date: '2024-11-28', amount: 4761256 },
      { date: '2024-11-29', amount: 1169530 },
      { date: '2024-11-30', amount: 792795 },
      { date: '2024-12-01', amount: 469651 },
      { date: '2024-12-02', amount: 497938 },
      { date: '2024-12-03', amount: 121080 },
      { date: '2024-12-04', amount: 954344 },
      { date: '2024-12-05', amount: 3268117 },
      { date: '2024-12-06', amount: 1027998 },
      { date: '2024-12-07', amount: 442096 },
      { date: '2024-12-08', amount: 354518 },
      { date: '2024-12-09', amount: 548360 },
      { date: '2024-12-10', amount: 509203 },
      { date: '2024-12-11', amount: 1230110 },
      { date: '2024-12-12', amount: 3613705 },
      { date: '2024-12-13', amount: 1110181 },
      { date: '2024-12-14', amount: 492072 },
      { date: '2024-12-15', amount: 482967 },
      { date: '2024-12-16', amount: 393337 },
      { date: '2024-12-17', amount: 380762 },
    ],
  },
  {
    name: '최악의 세대',
    launchDate: '2024-11-24',
    entries: [
      { date: '2024-11-24', amount: 800015 },
      { date: '2024-11-25', amount: 3837665 },
      { date: '2024-11-26', amount: 902703 },
      { date: '2024-11-27', amount: 985188 },
      { date: '2024-11-28', amount: 823940 },
      { date: '2024-11-29', amount: 727429 },
      { date: '2024-11-30', amount: 817876 },
      { date: '2024-12-01', amount: 3419727 },
      { date: '2024-12-02', amount: 12779737 },
      { date: '2024-12-03', amount: 613709 },
      { date: '2024-12-04', amount: 1881424 },
      { date: '2024-12-05', amount: 2000484 },
      { date: '2024-12-06', amount: 2382982 },
      { date: '2024-12-07', amount: 2271957 },
      { date: '2024-12-08', amount: 3675236 },
      { date: '2024-12-09', amount: 11389130 },
      { date: '2024-12-10', amount: 3817278 },
      { date: '2024-12-11', amount: 2133553 },
      { date: '2024-12-12', amount: 1681223 },
      { date: '2024-12-13', amount: 1446543 },
      { date: '2024-12-14', amount: 1130971 },
      { date: '2024-12-15', amount: 2986373 },
      { date: '2024-12-16', amount: 11313105 },
      { date: '2024-12-17', amount: 3405698 },
      { date: '2024-12-18', amount: 1938617 },
      { date: '2024-12-19', amount: 1468018 },
      { date: '2024-12-20', amount: 1252436 },
      { date: '2024-12-21', amount: 1042251 },
    ],
  },
  {
    name: '명왕',
    launchDate: '2024-12-27',
    entries: [
      { date: '2024-12-27', amount: 119600 },
      { date: '2024-12-28', amount: 611960 },
      { date: '2024-12-29', amount: 291378 },
      { date: '2024-12-30', amount: 470879 },
      { date: '2024-12-31', amount: 351830 },
      { date: '2025-01-01', amount: 387075 },
      { date: '2025-01-02', amount: 538729 },
      { date: '2025-01-03', amount: 1280479 },
      { date: '2025-01-04', amount: 3889473 },
      { date: '2025-01-05', amount: 2190635 },
      { date: '2025-01-06', amount: 1708633 },
      { date: '2025-01-07', amount: 957815 },
      { date: '2025-01-08', amount: 669865 },
      { date: '2025-01-09', amount: 644914 },
      { date: '2025-01-10', amount: 1134879 },
      { date: '2025-01-11', amount: 2738756 },
      { date: '2025-01-12', amount: 954249 },
      { date: '2025-01-13', amount: 526805 },
      { date: '2025-01-14', amount: 433848 },
      { date: '2025-01-15', amount: 401890 },
      { date: '2025-01-16', amount: 411415 },
      { date: '2025-01-17', amount: 776552 },
      { date: '2025-01-18', amount: 2286672 },
      { date: '2025-01-19', amount: 827605 },
      { date: '2025-01-20', amount: 571313 },
      { date: '2025-01-21', amount: 368509 },
      { date: '2025-01-22', amount: 265900 },
      { date: '2025-01-23', amount: 199259 },
    ],
  },
  {
    name: '이섭의 연애',
    launchDate: '2025-01-27',
    entries: [
      { date: '2025-01-27', amount: 9211264 },
      { date: '2025-01-28', amount: 23033855 },
      { date: '2025-01-29', amount: 7466848 },
      { date: '2025-01-30', amount: 5222026 },
      { date: '2025-01-31', amount: 3328588 },
      { date: '2025-02-01', amount: 2903081 },
      { date: '2025-02-02', amount: 2678090 },
      { date: '2025-02-03', amount: 9505769 },
      { date: '2025-02-04', amount: 20509413 },
      { date: '2025-02-05', amount: 6625250 },
      { date: '2025-02-06', amount: 5226295 },
      { date: '2025-02-07', amount: 3004257 },
      { date: '2025-02-08', amount: 2936543 },
      { date: '2025-02-09', amount: 2565294 },
      { date: '2025-02-10', amount: 6622760 },
      { date: '2025-02-11', amount: 13828565 },
      { date: '2025-02-12', amount: 4579006 },
      { date: '2025-02-13', amount: 2760931 },
      { date: '2025-02-14', amount: 2007330 },
      { date: '2025-02-15', amount: 2068950 },
      { date: '2025-02-16', amount: 1878889 },
      { date: '2025-02-17', amount: 6333540 },
      { date: '2025-02-18', amount: 14239006 },
      { date: '2025-02-19', amount: 4123888 },
      { date: '2025-02-20', amount: 2564511 },
      { date: '2025-02-21', amount: 1945046 },
      { date: '2025-02-22', amount: 1917430 },
      { date: '2025-02-23', amount: 1634393 },
    ],
  },
  {
    name: '냉동무사',
    launchDate: '2025-02-08',
    entries: [
      { date: '2025-02-08', amount: 1284778 },
      { date: '2025-02-09', amount: 6209516 },
      { date: '2025-02-10', amount: 1643307 },
      { date: '2025-02-11', amount: 2660840 },
      { date: '2025-02-12', amount: 1677201 },
      { date: '2025-02-13', amount: 1889863 },
      { date: '2025-02-14', amount: 3346869 },
      { date: '2025-02-15', amount: 3334315 },
      { date: '2025-02-16', amount: 4968014 },
      { date: '2025-02-17', amount: 2319291 },
      { date: '2025-02-18', amount: 1266383 },
      { date: '2025-02-19', amount: 1008923 },
      { date: '2025-02-20', amount: 1133858 },
      { date: '2025-02-21', amount: 908168 },
      { date: '2025-02-22', amount: 1715112 },
      { date: '2025-02-23', amount: 7581033 },
      { date: '2025-02-24', amount: 2439331 },
      { date: '2025-02-25', amount: 1069077 },
      { date: '2025-02-26', amount: 1262332 },
      { date: '2025-02-27', amount: 1036925 },
      { date: '2025-02-28', amount: 902049 },
      { date: '2025-03-01', amount: 1228544 },
      { date: '2025-03-02', amount: 2968056 },
      { date: '2025-03-03', amount: 1097543 },
      { date: '2025-03-04', amount: 648624 },
      { date: '2025-03-05', amount: 468917 },
      { date: '2025-03-06', amount: 499535 },
      { date: '2025-03-07', amount: 385952 },
    ],
  },
  {
    name: '킬링필드',
    launchDate: '2025-02-10',
    entries: [
      { date: '2025-02-10', amount: 175380 },
      { date: '2025-02-11', amount: 681744 },
      { date: '2025-02-12', amount: 222990 },
      { date: '2025-02-13', amount: 429830 },
      { date: '2025-02-14', amount: 745940 },
      { date: '2025-02-15', amount: 765901 },
      { date: '2025-02-16', amount: 502610 },
      { date: '2025-02-17', amount: 844815 },
      { date: '2025-02-18', amount: 2332006 },
      { date: '2025-02-19', amount: 771970 },
      { date: '2025-02-20', amount: 443771 },
      { date: '2025-02-21', amount: 305945 },
      { date: '2025-02-22', amount: 199838 },
      { date: '2025-02-23', amount: 173471 },
      { date: '2025-02-24', amount: 261080 },
      { date: '2025-02-25', amount: 875607 },
      { date: '2025-02-26', amount: 184138 },
      { date: '2025-02-27', amount: 108865 },
      { date: '2025-02-28', amount: 97467 },
      { date: '2025-03-01', amount: 67760 },
      { date: '2025-03-02', amount: 54905 },
      { date: '2025-03-03', amount: 158400 },
      { date: '2025-03-04', amount: 552980 },
      { date: '2025-03-05', amount: 181994 },
      { date: '2025-03-06', amount: 86994 },
      { date: '2025-03-07', amount: 62390 },
      { date: '2025-03-08', amount: 48600 },
      { date: '2025-03-09', amount: 45490 },
    ],
  },
  {
    name: '수트빨',
    launchDate: '2025-04-03',
    entries: [
      { date: '2025-04-03', amount: 781575 },
      { date: '2025-04-04', amount: 559084 },
      { date: '2025-04-05', amount: 1146318 },
      { date: '2025-04-06', amount: 986651 },
      { date: '2025-04-07', amount: 887070 },
      { date: '2025-04-08', amount: 729322 },
      { date: '2025-04-09', amount: 848447 },
      { date: '2025-04-10', amount: 2755282 },
      { date: '2025-04-11', amount: 1060470 },
      { date: '2025-04-12', amount: 659785 },
      { date: '2025-04-13', amount: 599333 },
      { date: '2025-04-14', amount: 541820 },
      { date: '2025-04-15', amount: 434950 },
      { date: '2025-04-16', amount: 820766 },
      { date: '2025-04-17', amount: 2425787 },
      { date: '2025-04-18', amount: 691753 },
      { date: '2025-04-19', amount: 392098 },
      { date: '2025-04-20', amount: 285760 },
      { date: '2025-04-21', amount: 257650 },
      { date: '2025-04-22', amount: 173795 },
      { date: '2025-04-23', amount: 549050 },
      { date: '2025-04-24', amount: 1448296 },
      { date: '2025-04-25', amount: 348181 },
      { date: '2025-04-26', amount: 191011 },
      { date: '2025-04-27', amount: 140592 },
      { date: '2025-04-28', amount: 116371 },
      { date: '2025-04-29', amount: 95140 },
      { date: '2025-04-30', amount: 431051 },
    ],
  },
  {
    name: '강제소집',
    launchDate: '2025-04-22',
    entries: [
      { date: '2025-04-22', amount: 285437 },
      { date: '2025-04-23', amount: 2990603 },
      { date: '2025-04-24', amount: 2293257 },
      { date: '2025-04-25', amount: 4021803 },
      { date: '2025-04-26', amount: 2384498 },
      { date: '2025-04-27', amount: 1763178 },
      { date: '2025-04-28', amount: 1878536 },
      { date: '2025-04-29', amount: 2775089 },
      { date: '2025-04-30', amount: 9284041 },
      { date: '2025-05-01', amount: 3576743 },
      { date: '2025-05-02', amount: 2028513 },
      { date: '2025-05-03', amount: 1374929 },
      { date: '2025-05-04', amount: 1449427 },
      { date: '2025-05-05', amount: 1321469 },
      { date: '2025-05-06', amount: 3186876 },
      { date: '2025-05-07', amount: 7339530 },
      { date: '2025-05-08', amount: 2712414 },
      { date: '2025-05-09', amount: 2088828 },
      { date: '2025-05-10', amount: 1589412 },
      { date: '2025-05-11', amount: 1434344 },
      { date: '2025-05-12', amount: 918098 },
      { date: '2025-05-13', amount: 2121536 },
      { date: '2025-05-14', amount: 5939299 },
      { date: '2025-05-15', amount: 2027266 },
      { date: '2025-05-16', amount: 1198406 },
      { date: '2025-05-17', amount: 863026 },
      { date: '2025-05-18', amount: 638904 },
      { date: '2025-05-19', amount: 623145 },
    ],
  },
  {
    name: '레벨 999고블린',
    launchDate: '2025-05-12',
    entries: [
      { date: '2025-05-12', amount: 964598 },
      { date: '2025-05-13', amount: 13460824 },
      { date: '2025-05-14', amount: 10303297 },
      { date: '2025-05-15', amount: 16357249 },
      { date: '2025-05-16', amount: 8556625 },
      { date: '2025-05-17', amount: 4926884 },
      { date: '2025-05-18', amount: 3934349 },
      { date: '2025-05-19', amount: 5714135 },
      { date: '2025-05-20', amount: 13739794 },
      { date: '2025-05-21', amount: 5220622 },
      { date: '2025-05-22', amount: 3280050 },
      { date: '2025-05-23', amount: 2721230 },
      { date: '2025-05-24', amount: 2073861 },
      { date: '2025-05-25', amount: 1804219 },
      { date: '2025-05-26', amount: 3776594 },
      { date: '2025-05-27', amount: 11286936 },
      { date: '2025-05-28', amount: 3543384 },
      { date: '2025-05-29', amount: 2156826 },
      { date: '2025-05-30', amount: 1506507 },
      { date: '2025-05-31', amount: 1206317 },
      { date: '2025-06-01', amount: 1069196 },
      { date: '2025-06-02', amount: 3063147 },
      { date: '2025-06-03', amount: 11513556 },
      { date: '2025-06-04', amount: 4137636 },
      { date: '2025-06-05', amount: 2529624 },
      { date: '2025-06-06', amount: 2124870 },
      { date: '2025-06-07', amount: 1636771 },
      { date: '2025-06-08', amount: 1326233 },
    ],
  },
  {
    name: '십이지소녀',
    launchDate: '2025-06-29',
    entries: [
      { date: '2025-06-29', amount: 121620 },
      { date: '2025-06-30', amount: 2472921 },
      { date: '2025-07-01', amount: 2123519 },
      { date: '2025-07-02', amount: 2252472 },
      { date: '2025-07-03', amount: 1493914 },
      { date: '2025-07-04', amount: 1083858 },
      { date: '2025-07-05', amount: 934192 },
      { date: '2025-07-06', amount: 1478197 },
      { date: '2025-07-07', amount: 2734708 },
      { date: '2025-07-08', amount: 1001089 },
      { date: '2025-07-09', amount: 680090 },
      { date: '2025-07-10', amount: 517843 },
      { date: '2025-07-11', amount: 458795 },
      { date: '2025-07-12', amount: 334627 },
      { date: '2025-07-13', amount: 961975 },
      { date: '2025-07-14', amount: 2403988 },
      { date: '2025-07-15', amount: 696081 },
      { date: '2025-07-16', amount: 412962 },
      { date: '2025-07-17', amount: 320654 },
      { date: '2025-07-18', amount: 249161 },
      { date: '2025-07-19', amount: 256889 },
      { date: '2025-07-20', amount: 786534 },
      { date: '2025-07-21', amount: 2163808 },
      { date: '2025-07-22', amount: 721997 },
      { date: '2025-07-23', amount: 449783 },
      { date: '2025-07-24', amount: 306635 },
      { date: '2025-07-25', amount: 265171 },
      { date: '2025-07-26', amount: 257658 },
    ],
  },
  {
    name: '용사생활기록부',
    launchDate: '2025-07-06',
    entries: [
      { date: '2025-07-06', amount: 1576232 },
      { date: '2025-07-07', amount: 833782 },
      { date: '2025-07-08', amount: 1792145 },
      { date: '2025-07-09', amount: 1431920 },
      { date: '2025-07-10', amount: 1105058 },
      { date: '2025-07-11', amount: 1500843 },
      { date: '2025-07-12', amount: 1471360 },
      { date: '2025-07-13', amount: 3167923 },
      { date: '2025-07-14', amount: 1322988 },
      { date: '2025-07-15', amount: 789123 },
      { date: '2025-07-16', amount: 462301 },
      { date: '2025-07-17', amount: 348462 },
      { date: '2025-07-18', amount: 300020 },
      { date: '2025-07-19', amount: 702177 },
      { date: '2025-07-20', amount: 2182739 },
      { date: '2025-07-21', amount: 704507 },
      { date: '2025-07-22', amount: 433431 },
      { date: '2025-07-23', amount: 302563 },
      { date: '2025-07-24', amount: 231330 },
      { date: '2025-07-25', amount: 234630 },
      { date: '2025-07-26', amount: 777283 },
      { date: '2025-07-27', amount: 2562655 },
      { date: '2025-07-28', amount: 910140 },
      { date: '2025-07-29', amount: 494206 },
      { date: '2025-07-30', amount: 393199 },
      { date: '2025-07-31', amount: 601391 },
      { date: '2025-08-01', amount: 345309 },
      { date: '2025-08-02', amount: 837620 },
    ],
  },
  {
    name: '태존비록',
    launchDate: '2025-07-12',
    entries: [
      { date: '2025-07-12', amount: 1724741 },
      { date: '2025-07-13', amount: 10641540 },
      { date: '2025-07-14', amount: 4954326 },
      { date: '2025-07-15', amount: 2709638 },
      { date: '2025-07-16', amount: 1523434 },
      { date: '2025-07-17', amount: 1138859 },
      { date: '2025-07-18', amount: 971384 },
      { date: '2025-07-19', amount: 2440515 },
      { date: '2025-07-20', amount: 8499296 },
      { date: '2025-07-21', amount: 5193804 },
      { date: '2025-07-22', amount: 2021697 },
      { date: '2025-07-23', amount: 1430806 },
      { date: '2025-07-24', amount: 1575567 },
      { date: '2025-07-25', amount: 1470948 },
      { date: '2025-07-26', amount: 2600497 },
      { date: '2025-07-27', amount: 9796085 },
      { date: '2025-07-28', amount: 3457510 },
      { date: '2025-07-29', amount: 2335103 },
      { date: '2025-07-30', amount: 1234703 },
      { date: '2025-07-31', amount: 925638 },
      { date: '2025-08-01', amount: 892462 },
      { date: '2025-08-02', amount: 2617561 },
      { date: '2025-08-03', amount: 8084313 },
      { date: '2025-08-04', amount: 2482912 },
      { date: '2025-08-05', amount: 1165515 },
      { date: '2025-08-06', amount: 838189 },
      { date: '2025-08-07', amount: 721745 },
      { date: '2025-08-08', amount: 589038 },
    ],
  },
  {
    name: '악귀나찰',
    launchDate: '2025-08-13',
    entries: [
      { date: '2025-08-13', amount: 491568 },
      { date: '2025-08-14', amount: 3702121 },
      { date: '2025-08-15', amount: 2235158 },
      { date: '2025-08-16', amount: 5038281 },
      { date: '2025-08-17', amount: 3172815 },
      { date: '2025-08-18', amount: 2658967 },
      { date: '2025-08-19', amount: 1704448 },
      { date: '2025-08-20', amount: 2183149 },
      { date: '2025-08-21', amount: 4210465 },
      { date: '2025-08-22', amount: 1669104 },
      { date: '2025-08-23', amount: 1192978 },
      { date: '2025-08-24', amount: 798817 },
      { date: '2025-08-25', amount: 604124 },
      { date: '2025-08-26', amount: 408489 },
      { date: '2025-08-27', amount: 915170 },
      { date: '2025-08-28', amount: 3991381 },
      { date: '2025-08-29', amount: 1409755 },
      { date: '2025-08-30', amount: 776836 },
      { date: '2025-08-31', amount: 634286 },
      { date: '2025-09-01', amount: 506369 },
      { date: '2025-09-02', amount: 363922 },
      { date: '2025-09-03', amount: 1377184 },
      { date: '2025-09-04', amount: 5065604 },
      { date: '2025-09-05', amount: 2076703 },
      { date: '2025-09-06', amount: 1324862 },
      { date: '2025-09-07', amount: 1001512 },
      { date: '2025-09-08', amount: 960060 },
      { date: '2025-09-09', amount: 674739 },
    ],
  },
  {
    name: '오나의교주님',
    launchDate: '2025-08-14',
    entries: [
      { date: '2025-08-14', amount: 177740 },
      { date: '2025-08-15', amount: 1197310 },
      { date: '2025-08-16', amount: 3148273 },
      { date: '2025-08-17', amount: 4429155 },
      { date: '2025-08-18', amount: 4019010 },
      { date: '2025-08-19', amount: 7320751 },
      { date: '2025-08-20', amount: 3867748 },
      { date: '2025-08-21', amount: 3368837 },
      { date: '2025-08-22', amount: 4658054 },
      { date: '2025-08-23', amount: 2315106 },
      { date: '2025-08-24', amount: 1862447 },
      { date: '2025-08-25', amount: 1959144 },
      { date: '2025-08-26', amount: 3893884 },
      { date: '2025-08-27', amount: 1749911 },
      { date: '2025-08-28', amount: 2175564 },
      { date: '2025-08-29', amount: 5139735 },
      { date: '2025-08-30', amount: 2380078 },
      { date: '2025-08-31', amount: 1777682 },
      { date: '2025-09-01', amount: 2058100 },
      { date: '2025-09-02', amount: 3810024 },
      { date: '2025-09-03', amount: 1581591 },
      { date: '2025-09-04', amount: 1777587 },
      { date: '2025-09-05', amount: 3203616 },
      { date: '2025-09-06', amount: 1265213 },
      { date: '2025-09-07', amount: 924323 },
      { date: '2025-09-08', amount: 1268232 },
      { date: '2025-09-09', amount: 2936584 },
      { date: '2025-09-10', amount: 1046816 },
    ],
  },
  {
    name: '오늘도 퇴근',
    launchDate: '2025-09-15',
    entries: [
      { date: '2025-09-15', amount: 185960 },
      { date: '2025-09-16', amount: 5701860 },
      { date: '2025-09-17', amount: 2921717 },
      { date: '2025-09-18', amount: 4485777 },
      { date: '2025-09-19', amount: 2869338 },
      { date: '2025-09-20', amount: 2317087 },
      { date: '2025-09-21', amount: 1646579 },
      { date: '2025-09-22', amount: 3596563 },
      { date: '2025-09-23', amount: 14615762 },
      { date: '2025-09-24', amount: 4456339 },
      { date: '2025-09-25', amount: 2790113 },
      { date: '2025-09-26', amount: 2079800 },
      { date: '2025-09-27', amount: 1565729 },
      { date: '2025-09-28', amount: 1196809 },
      { date: '2025-09-29', amount: 2547634 },
      { date: '2025-09-30', amount: 9926800 },
      { date: '2025-10-01', amount: 2946708 },
      { date: '2025-10-02', amount: 1791851 },
      { date: '2025-10-03', amount: 1593796 },
      { date: '2025-10-04', amount: 1430547 },
      { date: '2025-10-05', amount: 842488 },
      { date: '2025-10-06', amount: 2245058 },
      { date: '2025-10-07', amount: 6579642 },
      { date: '2025-10-08', amount: 1954146 },
      { date: '2025-10-09', amount: 1242616 },
      { date: '2025-10-10', amount: 1017566 },
      { date: '2025-10-11', amount: 694366 },
      { date: '2025-10-12', amount: 580017 },
    ],
  },
  {
    name: '밤친구',
    launchDate: '2025-10-09',
    entries: [
      { date: '2025-10-09', amount: 1535324 },
      { date: '2025-10-10', amount: 15576944 },
      { date: '2025-10-11', amount: 13434350 },
      { date: '2025-10-12', amount: 15492698 },
      { date: '2025-10-13', amount: 9556829 },
      { date: '2025-10-14', amount: 6953272 },
      { date: '2025-10-15', amount: 5928370 },
      { date: '2025-10-16', amount: 8481083 },
      { date: '2025-10-17', amount: 12194663 },
      { date: '2025-10-18', amount: 7590477 },
      { date: '2025-10-19', amount: 7024191 },
      { date: '2025-10-20', amount: 4574314 },
      { date: '2025-10-21', amount: 3381495 },
      { date: '2025-10-22', amount: 2895768 },
      { date: '2025-10-23', amount: 4809840 },
      { date: '2025-10-24', amount: 8141300 },
      { date: '2025-10-25', amount: 5713446 },
      { date: '2025-10-26', amount: 5223944 },
      { date: '2025-10-27', amount: 3014328 },
      { date: '2025-10-28', amount: 2373652 },
      { date: '2025-10-29', amount: 5032423 },
      { date: '2025-10-30', amount: 3727456 },
      { date: '2025-10-31', amount: 8078103 },
      { date: '2025-11-01', amount: 5663657 },
      { date: '2025-11-02', amount: 5443430 },
      { date: '2025-11-03', amount: 3636776 },
      { date: '2025-11-04', amount: 3360645 },
      { date: '2025-11-05', amount: 2595113 },
    ],
  },
  {
    name: '두 남자의 비서 사이',
    launchDate: '2025-12-05',
    entries: [
      { date: '2025-12-05', amount: 3268089 },
      { date: '2025-12-06', amount: 33643286 },
      { date: '2025-12-07', amount: 26427529 },
      { date: '2025-12-08', amount: 19835905 },
      { date: '2025-12-09', amount: 13570642 },
      { date: '2025-12-10', amount: 11235238 },
      { date: '2025-12-11', amount: 9517642 },
      { date: '2025-12-12', amount: 10526970 },
      { date: '2025-12-13', amount: 16250928 },
      { date: '2025-12-14', amount: 11420200 },
      { date: '2025-12-15', amount: 7326788 },
      { date: '2025-12-16', amount: 5266517 },
      { date: '2025-12-17', amount: 4281666 },
      { date: '2025-12-18', amount: 3773410 },
      { date: '2025-12-19', amount: 5517610 },
      { date: '2025-12-20', amount: 11435196 },
      { date: '2025-12-21', amount: 6545621 },
      { date: '2025-12-22', amount: 4098197 },
      { date: '2025-12-23', amount: 3191746 },
      { date: '2025-12-24', amount: 2230101 },
      { date: '2025-12-25', amount: 2672681 },
      { date: '2025-12-26', amount: 4635530 },
      { date: '2025-12-27', amount: 8596741 },
      { date: '2025-12-28', amount: 4603651 },
      { date: '2025-12-29', amount: 2932371 },
      { date: '2025-12-30', amount: 2290796 },
      { date: '2025-12-31', amount: 1897644 },
      { date: '2026-01-01', amount: 1928752 },
    ],
  },
  {
    name: '블러드레인3',
    launchDate: '2025-12-15',
    entries: [
      { date: '2025-12-15', amount: 3233296 },
      { date: '2025-12-16', amount: 14104048 },
      { date: '2025-12-17', amount: 6010378 },
      { date: '2025-12-18', amount: 5401089 },
      { date: '2025-12-19', amount: 3543377 },
      { date: '2025-12-20', amount: 2108647 },
      { date: '2025-12-21', amount: 1603487 },
      { date: '2025-12-22', amount: 3936719 },
      { date: '2025-12-23', amount: 7984276 },
      { date: '2025-12-24', amount: 2440872 },
      { date: '2025-12-25', amount: 1625747 },
      { date: '2025-12-26', amount: 1272181 },
      { date: '2025-12-27', amount: 895368 },
      { date: '2025-12-28', amount: 745085 },
      { date: '2025-12-29', amount: 2840366 },
      { date: '2025-12-30', amount: 6037510 },
      { date: '2025-12-31', amount: 1693692 },
      { date: '2026-01-01', amount: 988602 },
      { date: '2026-01-02', amount: 848191 },
      { date: '2026-01-03', amount: 632881 },
      { date: '2026-01-04', amount: 506616 },
      { date: '2026-01-05', amount: 2748190 },
      { date: '2026-01-06', amount: 5362633 },
      { date: '2026-01-07', amount: 1488681 },
      { date: '2026-01-08', amount: 869277 },
      { date: '2026-01-09', amount: 634606 },
      { date: '2026-01-10', amount: 493968 },
      { date: '2026-01-11', amount: 456046 },
    ],
  },
  {
    name: '공주님 학교 가신다',
    launchDate: '2025-12-18',
    entries: [
      { date: '2025-12-18', amount: 137302 },
      { date: '2025-12-19', amount: 852310 },
      { date: '2025-12-20', amount: 496543 },
      { date: '2025-12-21', amount: 820716 },
      { date: '2025-12-22', amount: 887946 },
      { date: '2025-12-23', amount: 663163 },
      { date: '2025-12-24', amount: 426650 },
      { date: '2025-12-25', amount: 455253 },
      { date: '2025-12-26', amount: 953276 },
      { date: '2025-12-27', amount: 425344 },
      { date: '2025-12-28', amount: 273751 },
      { date: '2025-12-29', amount: 179305 },
      { date: '2025-12-30', amount: 167766 },
      { date: '2025-12-31', amount: 142048 },
      { date: '2026-01-01', amount: 188783 },
      { date: '2026-01-02', amount: 319778 },
      { date: '2026-01-03', amount: 111069 },
      { date: '2026-01-04', amount: 78650 },
      { date: '2026-01-05', amount: 62805 },
      { date: '2026-01-06', amount: 57640 },
      { date: '2026-01-07', amount: 54835 },
      { date: '2026-01-08', amount: 101633 },
      { date: '2026-01-09', amount: 340652 },
      { date: '2026-01-10', amount: 117558 },
      { date: '2026-01-11', amount: 78580 },
      { date: '2026-01-12', amount: 63225 },
      { date: '2026-01-13', amount: 47315 },
      { date: '2026-01-14', amount: 49780 },
    ],
  },
  {
    name: '로열패밀리',
    launchDate: '2025-12-23',
    entries: [
      { date: '2025-12-23', amount: 400363 },
      { date: '2025-12-24', amount: 1875992 },
      { date: '2025-12-25', amount: 1221411 },
      { date: '2025-12-26', amount: 1541064 },
      { date: '2025-12-27', amount: 1083875 },
      { date: '2025-12-28', amount: 700463 },
      { date: '2025-12-29', amount: 571068 },
      { date: '2025-12-30', amount: 961808 },
      { date: '2025-12-31', amount: 2724457 },
      { date: '2026-01-01', amount: 924612 },
      { date: '2026-01-02', amount: 768259 },
      { date: '2026-01-03', amount: 468356 },
      { date: '2026-01-04', amount: 350821 },
      { date: '2026-01-05', amount: 368134 },
      { date: '2026-01-06', amount: 605225 },
      { date: '2026-01-07', amount: 1756285 },
      { date: '2026-01-08', amount: 638792 },
      { date: '2026-01-09', amount: 328731 },
      { date: '2026-01-10', amount: 248692 },
      { date: '2026-01-11', amount: 225400 },
      { date: '2026-01-12', amount: 182375 },
      { date: '2026-01-13', amount: 512660 },
      { date: '2026-01-14', amount: 1746812 },
      { date: '2026-01-15', amount: 696811 },
      { date: '2026-01-16', amount: 708202 },
      { date: '2026-01-17', amount: 529982 },
      { date: '2026-01-18', amount: 584592 },
      { date: '2026-01-19', amount: 479413 },
    ],
  },
  {
    name: '유쾌한 신',
    launchDate: '2025-12-27',
    entries: [
      { date: '2025-12-27', amount: 192630 },
      { date: '2025-12-28', amount: 1250878 },
      { date: '2025-12-29', amount: 1204412 },
      { date: '2025-12-30', amount: 2475315 },
      { date: '2025-12-31', amount: 3219481 },
      { date: '2026-01-01', amount: 1784418 },
      { date: '2026-01-02', amount: 1420254 },
      { date: '2026-01-03', amount: 1575694 },
      { date: '2026-01-04', amount: 3474908 },
      { date: '2026-01-05', amount: 1725766 },
      { date: '2026-01-06', amount: 1490835 },
      { date: '2026-01-07', amount: 2074141 },
      { date: '2026-01-08', amount: 960288 },
      { date: '2026-01-09', amount: 665584 },
      { date: '2026-01-10', amount: 1005787 },
      { date: '2026-01-11', amount: 2300947 },
      { date: '2026-01-12', amount: 990089 },
      { date: '2026-01-13', amount: 1024988 },
      { date: '2026-01-14', amount: 1936725 },
      { date: '2026-01-15', amount: 864406 },
      { date: '2026-01-16', amount: 585218 },
      { date: '2026-01-17', amount: 794199 },
      { date: '2026-01-18', amount: 1631435 },
      { date: '2026-01-19', amount: 672697 },
      { date: '2026-01-20', amount: 676680 },
      { date: '2026-01-21', amount: 1118009 },
      { date: '2026-01-22', amount: 445786 },
      { date: '2026-01-23', amount: 317721 },
    ],
  },
  {
    name: '박제',
    launchDate: '2026-01-08',
    entries: [
      { date: '2026-01-08', amount: 727552 },
      { date: '2026-01-09', amount: 4045697 },
      { date: '2026-01-10', amount: 3784589 },
      { date: '2026-01-11', amount: 3846226 },
      { date: '2026-01-12', amount: 1807210 },
      { date: '2026-01-13', amount: 1275186 },
      { date: '2026-01-14', amount: 1025516 },
      { date: '2026-01-15', amount: 1883887 },
      { date: '2026-01-16', amount: 4163702 },
      { date: '2026-01-17', amount: 2639247 },
      { date: '2026-01-18', amount: 1969657 },
      { date: '2026-01-19', amount: 916884 },
      { date: '2026-01-20', amount: 650245 },
      { date: '2026-01-21', amount: 570759 },
      { date: '2026-01-22', amount: 995806 },
      { date: '2026-01-23', amount: 2067946 },
      { date: '2026-01-24', amount: 1114703 },
      { date: '2026-01-25', amount: 844114 },
      { date: '2026-01-26', amount: 434557 },
      { date: '2026-01-27', amount: 340879 },
      { date: '2026-01-28', amount: 338961 },
      { date: '2026-01-29', amount: 784562 },
      { date: '2026-01-30', amount: 2045502 },
      { date: '2026-01-31', amount: 1072820 },
      { date: '2026-02-01', amount: 806541 },
      { date: '2026-02-02', amount: 402583 },
      { date: '2026-02-03', amount: 295022 },
      { date: '2026-02-04', amount: 281858 },
    ],
  },
  {
    name: '오브차카',
    launchDate: '2026-01-16',
    entries: [
      { date: '2026-01-16', amount: 293197 },
      { date: '2026-01-17', amount: 2899187 },
      { date: '2026-01-18', amount: 2016713 },
      { date: '2026-01-19', amount: 4804907 },
      { date: '2026-01-20', amount: 3023728 },
      { date: '2026-01-21', amount: 2368315 },
      { date: '2026-01-22', amount: 1362851 },
      { date: '2026-01-23', amount: 2086130 },
      { date: '2026-01-24', amount: 6606566 },
      { date: '2026-01-25', amount: 2858300 },
      { date: '2026-01-26', amount: 2176787 },
      { date: '2026-01-27', amount: 1438313 },
      { date: '2026-01-28', amount: 1106781 },
      { date: '2026-01-29', amount: 811002 },
      { date: '2026-01-30', amount: 1591719 },
      { date: '2026-01-31', amount: 5063386 },
      { date: '2026-02-01', amount: 2231758 },
      { date: '2026-02-02', amount: 1475311 },
      { date: '2026-02-03', amount: 1077248 },
      { date: '2026-02-04', amount: 1961585 },
      { date: '2026-02-05', amount: 1757603 },
      { date: '2026-02-06', amount: 2149104 },
      { date: '2026-02-07', amount: 4609501 },
      { date: '2026-02-08', amount: 1594367 },
      { date: '2026-02-09', amount: 1180477 },
      { date: '2026-02-10', amount: 786949 },
      { date: '2026-02-11', amount: 889634 },
      { date: '2026-02-12', amount: 775550 },
    ],
  },
  {
    name: '전무님은 하룻밤이 부족하다',
    launchDate: '2026-01-18',
    entries: [
      { date: '2026-01-18', amount: 349730 },
      { date: '2026-01-19', amount: 5673873 },
      { date: '2026-01-20', amount: 7143512 },
      { date: '2026-01-21', amount: 9457473 },
      { date: '2026-01-22', amount: 7322070 },
      { date: '2026-01-23', amount: 5919070 },
      { date: '2026-01-24', amount: 7513273 },
      { date: '2026-01-25', amount: 7439842 },
      { date: '2026-01-26', amount: 6039839 },
      { date: '2026-01-27', amount: 3630470 },
      { date: '2026-01-28', amount: 2990484 },
      { date: '2026-01-29', amount: 2603135 },
      { date: '2026-01-30', amount: 2127785 },
      { date: '2026-01-31', amount: 2714854 },
      { date: '2026-02-01', amount: 3258580 },
      { date: '2026-02-02', amount: 3919352 },
      { date: '2026-02-03', amount: 2037272 },
      { date: '2026-02-04', amount: 1677032 },
      { date: '2026-02-05', amount: 1590095 },
      { date: '2026-02-06', amount: 1376441 },
      { date: '2026-02-07', amount: 1830736 },
      { date: '2026-02-08', amount: 2753943 },
      { date: '2026-02-09', amount: 3118054 },
      { date: '2026-02-10', amount: 1886607 },
      { date: '2026-02-11', amount: 1539429 },
      { date: '2026-02-12', amount: 1364928 },
      { date: '2026-02-13', amount: 1055303 },
      { date: '2026-02-14', amount: 1449518 },
    ],
  },
  {
    name: '늦바람',
    launchDate: '2026-03-21',
    entries: [
      { date: '2026-03-21', amount: 256528 },
      { date: '2026-03-22', amount: 18079311 },
      { date: '2026-03-23', amount: 12140913 },
      { date: '2026-03-24', amount: 12492960 },
      { date: '2026-03-25', amount: 9307421 },
      { date: '2026-03-26', amount: 7014539 },
      { date: '2026-03-27', amount: 6275702 },
      { date: '2026-03-28', amount: 7852786 },
      { date: '2026-03-29', amount: 9939578 },
      { date: '2026-03-30', amount: 5103558 },
      { date: '2026-03-31', amount: 4100667 },
      { date: '2026-04-01', amount: 4365883 },
      { date: '2026-04-02', amount: 3597572 },
      { date: '2026-04-03', amount: 3112101 },
      { date: '2026-04-04', amount: 4662701 },
      { date: '2026-04-05', amount: 6726415 },
      { date: '2026-04-06', amount: 3743148 },
      { date: '2026-04-07', amount: 2703151 },
      { date: '2026-04-08', amount: 2670922 },
      { date: '2026-04-09', amount: 3211645 },
      { date: '2026-04-10', amount: 2970367 },
      { date: '2026-04-11', amount: 3905908 },
      { date: '2026-04-12', amount: 6072139 },
      { date: '2026-04-13', amount: 3421400 },
      { date: '2026-04-14', amount: 2439260 },
      { date: '2026-04-15', amount: 2010343 },
      { date: '2026-04-16', amount: 1878032 },
      { date: '2026-04-17', amount: 1783254 },
    ],
  },
  {
    name: '범죄도시 제로',
    launchDate: '2026-02-14',
    entries: [
      { date: '2026-02-14', amount: 1097728 },
      { date: '2026-02-15', amount: 13181480 },
      { date: '2026-02-16', amount: 20581372 },
      { date: '2026-02-17', amount: 13656660 },
      { date: '2026-02-18', amount: 8190877 },
      { date: '2026-02-19', amount: 6827602 },
      { date: '2026-02-20', amount: 5274338 },
      { date: '2026-02-21', amount: 9819993 },
      { date: '2026-02-22', amount: 40460216 },
      { date: '2026-02-23', amount: 17952541 },
      { date: '2026-02-24', amount: 9817951 },
      { date: '2026-02-25', amount: 7122870 },
      { date: '2026-02-26', amount: 5778473 },
      { date: '2026-02-27', amount: 4964440 },
      { date: '2026-02-28', amount: 8491004 },
      { date: '2026-03-01', amount: 26078206 },
      { date: '2026-03-02', amount: 10404681 },
      { date: '2026-03-03', amount: 7227153 },
      { date: '2026-03-04', amount: 5405441 },
      { date: '2026-03-05', amount: 4971272 },
      { date: '2026-03-06', amount: 4755292 },
      { date: '2026-03-07', amount: 8821494 },
      { date: '2026-03-08', amount: 23797445 },
      { date: '2026-03-09', amount: 9415056 },
      { date: '2026-03-10', amount: 5312403 },
      { date: '2026-03-11', amount: 3983144 },
      { date: '2026-03-12', amount: 3405013 },
      { date: '2026-03-13', amount: 2794485 },
    ],
  },
  {
    name: '양치기 마법사',
    launchDate: '2026-02-23',
    entries: [
      { date: '2026-02-23', amount: 1141395 },
      { date: '2026-02-24', amount: 13327296 },
      { date: '2026-02-25', amount: 7041919 },
      { date: '2026-02-26', amount: 7666748 },
      { date: '2026-02-27', amount: 4728387 },
      { date: '2026-02-28', amount: 3029899 },
      { date: '2026-03-01', amount: 2477074 },
      { date: '2026-03-02', amount: 4640360 },
      { date: '2026-03-03', amount: 12550376 },
      { date: '2026-03-04', amount: 3988857 },
      { date: '2026-03-05', amount: 3290329 },
      { date: '2026-03-06', amount: 2330514 },
      { date: '2026-03-07', amount: 1600350 },
      { date: '2026-03-08', amount: 1217311 },
      { date: '2026-03-09', amount: 2982539 },
      { date: '2026-03-10', amount: 9153073 },
      { date: '2026-03-11', amount: 3695118 },
      { date: '2026-03-12', amount: 2408411 },
      { date: '2026-03-13', amount: 1245258 },
      { date: '2026-03-14', amount: 997658 },
      { date: '2026-03-15', amount: 791239 },
      { date: '2026-03-16', amount: 3041604 },
      { date: '2026-03-17', amount: 10743539 },
      { date: '2026-03-18', amount: 3370175 },
      { date: '2026-03-19', amount: 2459630 },
      { date: '2026-03-20', amount: 2559763 },
      { date: '2026-03-21', amount: 2125093 },
      { date: '2026-03-22', amount: 1574314 },
    ],
  },
  {
    name: '국정원 말단직원',
    launchDate: '2026-02-11',
    entries: [
      { date: '2026-02-11', amount: 333510 },
      { date: '2026-02-12', amount: 3932391 },
      { date: '2026-02-13', amount: 3708189 },
      { date: '2026-02-14', amount: 6124889 },
      { date: '2026-02-15', amount: 3972332 },
      { date: '2026-02-16', amount: 3988558 },
      { date: '2026-02-17', amount: 2610230 },
      { date: '2026-02-18', amount: 3176010 },
      { date: '2026-02-19', amount: 9392788 },
      { date: '2026-02-20', amount: 3617104 },
      { date: '2026-02-21', amount: 2168930 },
      { date: '2026-02-22', amount: 1725853 },
      { date: '2026-02-23', amount: 1325336 },
      { date: '2026-02-24', amount: 921656 },
      { date: '2026-02-25', amount: 1872517 },
      { date: '2026-02-26', amount: 7009770 },
      { date: '2026-02-27', amount: 2414674 },
      { date: '2026-02-28', amount: 1364544 },
      { date: '2026-03-01', amount: 947530 },
      { date: '2026-03-02', amount: 783659 },
      { date: '2026-03-03', amount: 591507 },
      { date: '2026-03-04', amount: 1476045 },
      { date: '2026-03-05', amount: 4878562 },
      { date: '2026-03-06', amount: 1765522 },
      { date: '2026-03-07', amount: 1071297 },
      { date: '2026-03-08', amount: 878199 },
      { date: '2026-03-09', amount: 688966 },
      { date: '2026-03-10', amount: 528059 },
    ],
  },
];

type PeriodMode = 'daily' | 'weekly' | 'total';
type StatusFilter = 'all' | '작업중' | '작업 완료';

const PERIOD_MODES: { mode: PeriodMode; label: string }[] = [
  { mode: 'daily', label: '일별' },
  { mode: 'weekly', label: '주별' },
  { mode: 'total', label: '전체' },
];

function dayLabel(launchDate: string, date: string) {
  const diff = Math.floor((new Date(date).getTime() - new Date(launchDate).getTime()) / (1000 * 60 * 60 * 24));
  return `D+${diff}`;
}

function getWeekNum(launchDate: string, date: string) {
  const diff = Math.floor((new Date(date).getTime() - new Date(launchDate).getTime()) / (1000 * 60 * 60 * 24));
  return Math.floor(diff / 7) + 1;
}

interface AggRow {
  label: string;
  sub?: string;
  amount: number;
  fee: number;
  grimSales: number;
  days: number;
}

function aggregateEntries(work: TrackedWork, rsRate: number, mode: PeriodMode): AggRow[] {
  if (mode === 'daily') {
    return work.entries.map(e => {
      const fee = Math.round(e.amount * MARKET_FEE_RATE);
      const grimSales = Math.round((e.amount - fee) * rsRate);
      return {
        label: e.date,
        sub: dayLabel(work.launchDate, e.date),
        amount: e.amount,
        fee,
        grimSales,
        days: 1,
      };
    });
  }

  if (mode === 'weekly') {
    const weeks: Record<number, { amount: number; dates: string[] }> = {};
    for (const e of work.entries) {
      const w = getWeekNum(work.launchDate, e.date);
      if (!weeks[w]) weeks[w] = { amount: 0, dates: [] };
      weeks[w].amount += e.amount;
      weeks[w].dates.push(e.date);
    }
    return Object.entries(weeks)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([wk, data]) => {
        const fee = Math.round(data.amount * MARKET_FEE_RATE);
        const grimSales = Math.round((data.amount - fee) * rsRate);
        const sorted = data.dates.sort();
        return {
          label: `${wk}주차`,
          sub: `${sorted[0]} ~ ${sorted[sorted.length - 1]}`,
          amount: data.amount,
          fee,
          grimSales,
          days: data.dates.length,
        };
      });
  }

  // total
  let total = 0;
  for (const e of work.entries) total += e.amount;
  const fee = Math.round(total * MARKET_FEE_RATE);
  const grimSales = Math.round((total - fee) * rsRate);
  const sorted = work.entries.map(e => e.date).sort();
  return [{
    label: '전체 (1개월)',
    sub: `${sorted[0]} ~ ${sorted[sorted.length - 1]}`,
    amount: total,
    fee,
    grimSales,
    days: work.entries.length,
  }];
}

export default function NewWorksTrackingPage() {
  const { profile } = useStore();
  const { toggleSidebar } = useSidebar();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [labelFilter, setLabelFilter] = useState<TeamLabel | 'all'>('all');
  const [selectedWork, setSelectedWork] = useState<string>(TRACKED_WORKS[0]?.name || '');
  const [periodMode, setPeriodMode] = useState<PeriodMode>('daily');
  const [compareSet, setCompareSet] = useState<Set<string>>(new Set());
  const [hiddenWorks, setHiddenWorks] = useState<Set<string>>(new Set());
  const [workFilterOpen, setWorkFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const [apiData, setApiData] = useState<DailySalesData | null>(null);

  const latestTrackedDate = useMemo(() => {
    let latest = '2000-01-01';
    for (const w of TRACKED_WORKS) {
      if (w.launchDate > latest) latest = w.launchDate;
    }
    return latest;
  }, []);

  const trackedNames = useMemo(() => new Set(TRACKED_WORKS.map(w => w.name)), []);

  const fetchFrom = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return dateStr(d);
  }, []);

  const newWorkCutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return dateStr(d);
  }, []);

  useEffect(() => {
    if (!profile || !canViewSales(profile.role)) return;
    settlementFetch(`/api/accounting/sales?from=${fetchFrom}&to=${dateStr(new Date())}`)
      .then(r => r.json())
      .then((d: DailySalesData) => setApiData(normalizeSalesData(d)))
      .catch(console.error);
  }, [profile, fetchFrom]);

  const autoTrackedWorks = useMemo<TrackedWork[]>(() => {
    if (!apiData?.works) return [];
    const result: TrackedWork[] = [];
    for (const [name, dailySales] of Object.entries(apiData.works)) {
      if (trackedNames.has(name) || EXCLUDED_FROM_AUTO_TRACKING.has(name)) continue;
      const sorted = [...dailySales].sort((a, b) => a.date.localeCompare(b.date));
      if (sorted.length === 0) continue;
      const firstDate = sorted[0].date;
      if (firstDate < newWorkCutoff) continue;
      const entries = sorted.slice(0, 28).map(d => ({ date: d.date, amount: d.amount }));
      result.push({ name, launchDate: firstDate, entries });
    }
    return result;
  }, [apiData, trackedNames, newWorkCutoff]);

  const allTrackedWorks = useMemo(() => [...TRACKED_WORKS, ...autoTrackedWorks], [autoTrackedWorks]);

  useEffect(() => {
    if (!workFilterOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setWorkFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [workFilterOpen]);

  const [titles, setTitles] = useState<TitleMasterInfo[]>([]);
  useEffect(() => { fetchAllTitlesFromDB().then(setTitles).catch(() => {}); }, []);
  const titleMap = useMemo(() => new Map(titles.map(t => [t.title, t])), [titles]);

  if (!profile || !canViewSales(profile.role)) return null;

  const filteredWorks = useMemo(() => {
    return allTrackedWorks.filter(w => {
      if (hiddenWorks.has(w.name)) return false;
      const info = titleMap.get(w.name);
      if (statusFilter !== 'all') {
        const isComplete = w.entries.length >= 28;
        if (statusFilter === '작업 완료' && !isComplete) return false;
        if (statusFilter === '작업중' && isComplete) return false;
      }
      if (labelFilter !== 'all') {
        if (!info || info.teamLabel !== labelFilter) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const nameMatch = w.name.toLowerCase().includes(q);
        const creatorMatch = info?.creators.some(c => c.name.toLowerCase().includes(q));
        const genreMatch = info?.mainGenre.toLowerCase().includes(q);
        if (!nameMatch && !creatorMatch && !genreMatch) return false;
      }
      return true;
    });
  }, [allTrackedWorks, search, statusFilter, labelFilter, titleMap, hiddenWorks]);

  const toggleWorkVisibility = (name: string) => {
    setHiddenWorks(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const allWorksSorted = useMemo(() => {
    return allTrackedWorks.map(w => {
      let total = 0;
      for (const e of w.entries) total += e.amount;
      return { name: w.name, total };
    }).sort((a, b) => b.total - a.total);
  }, [allTrackedWorks]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0, '작업중': 0, '작업 완료': 0 };
    for (const w of allTrackedWorks) {
      counts.all++;
      if (w.entries.length >= 28) counts['작업 완료']++;
      else counts['작업중']++;
    }
    return counts;
  }, [allTrackedWorks]);

  const currentWork = filteredWorks.find(w => w.name === selectedWork) || filteredWorks[0];

  const workSummaries = useMemo(() => {
    return filteredWorks.map(w => {
      const rsRate = getRsRate(w.name);
      let total = 0;
      for (const e of w.entries) total += e.amount;
      const fee = Math.round(total * MARKET_FEE_RATE);
      const grimSales = Math.round((total - fee) * rsRate);
      const dailyAvg = w.entries.length > 0 ? Math.round(total / w.entries.length) : 0;
      const weeks = w.entries.length / 7;
      const weeklyAvg = weeks > 0 ? Math.round(total / weeks) : 0;
      return { name: w.name, total, fee, grimSales, days: w.entries.length, dailyAvg, weeklyAvg };
    }).sort((a, b) => b.total - a.total);
  }, [filteredWorks]);

  const tableRows = useMemo(() => {
    if (!currentWork) return [];
    return aggregateEntries(currentWork, getRsRate(currentWork.name), periodMode);
  }, [currentWork, periodMode]);

  const tableTotals = useMemo(() => {
    let amount = 0, fee = 0, grim = 0, days = 0;
    for (const r of tableRows) { amount += r.amount; fee += r.fee; grim += r.grimSales; days += r.days; }
    return { amount, fee, grim, days };
  }, [tableRows]);

  const toggleCompare = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCompareSet(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const compareChartData = useMemo(() => {
    if (compareSet.size < 2) return [];
    const days = 28;
    const data: Record<string, string | number>[] = [];
    for (let d = 0; d < days; d++) {
      const point: Record<string, string | number> = { day: `D+${d}` };
      for (const name of compareSet) {
        const work = allTrackedWorks.find(w => w.name === name);
        if (work && work.entries[d]) {
          point[name] = work.entries[d].amount;
        }
      }
      data.push(point);
    }
    return data;
  }, [compareSet, allTrackedWorks]);

  const compareNames = useMemo(() => Array.from(compareSet), [compareSet]);

  return (
    <div className="space-y-6 max-w-[1800px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">신작 매출 트래킹</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">연재 시작 후 1개월간 매출 추이</p>
        </div>
        <button onClick={toggleSidebar}
          className="md:hidden h-9 w-9 rounded-xl bg-white/60 dark:bg-white/10 backdrop-blur-sm border border-black/[0.12] dark:border-white/[0.12] flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-white/80 dark:hover:bg-white/15 transition-all duration-200">
          <Menu className="h-4.5 w-4.5" />
        </button>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative min-w-[180px] max-w-xs flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 z-10" />
            <input type="text" placeholder="작품명, 작가, 장르 검색..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-black/[0.12] dark:border-white/[0.12] bg-white/60 dark:bg-white/5 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
          </div>
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setWorkFilterOpen(v => !v)}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-xl border transition-all duration-200 ${
                hiddenWorks.size > 0
                  ? 'border-cyan-300 dark:border-cyan-700 bg-cyan-50 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300'
                  : 'border-black/[0.12] dark:border-white/[0.12] bg-white/60 dark:bg-white/5 backdrop-blur-sm text-zinc-500 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-500'
              }`}
            >
              작품 필터
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${workFilterOpen ? 'rotate-180' : ''}`} />
              {hiddenWorks.size > 0 && (
                <span className="text-xs bg-cyan-500 text-white rounded-full px-1.5 py-0.5 leading-none">{allTrackedWorks.length - hiddenWorks.size}/{allTrackedWorks.length}</span>
              )}
            </button>
            {workFilterOpen && (
              <div className="absolute top-full left-0 mt-2 w-72 bg-white/90 dark:bg-zinc-800/90 backdrop-blur-xl rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-white/60 dark:border-white/10 z-50 overflow-hidden"
                onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 dark:border-zinc-700">
                  <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">작품 필터</span>
                  <div className="flex gap-2">
                    <button onClick={() => setHiddenWorks(new Set())} className="text-[11px] text-cyan-500 hover:text-cyan-400 font-medium">전체 선택</button>
                    <button onClick={() => setHiddenWorks(new Set(allTrackedWorks.map(w => w.name)))} className="text-[11px] text-zinc-400 hover:text-zinc-300 font-medium">전체 해제</button>
                  </div>
                </div>
                <div className="max-h-72 overflow-y-auto py-1">
                  {allWorksSorted.map(w => (
                    <label key={w.name} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={!hiddenWorks.has(w.name)}
                        onChange={() => toggleWorkVisibility(w.name)}
                        className="rounded border-zinc-300 dark:border-zinc-600 text-cyan-500 focus:ring-cyan-500 h-3.5 w-3.5"
                      />
                      <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate">{w.name}</span>
                      <span className="ml-auto text-xs text-zinc-400 tabular-nums">{fmtShortComma(w.total)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex bg-black/[0.06] dark:bg-white/[0.08] backdrop-blur-sm rounded-xl p-0.5 w-fit">
            {PERIOD_MODES.map(p => (
              <button key={p.mode} onClick={() => setPeriodMode(p.mode)}
                className={`px-3.5 py-2 text-sm font-medium rounded-[10px] transition-all duration-200 ${
                  periodMode === p.mode
                    ? 'bg-white/80 dark:bg-white/15 shadow-sm backdrop-blur-sm text-zinc-900 dark:text-zinc-100'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                }`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-400 dark:text-zinc-500 mr-1 font-medium">상태</span>
          {([
            { value: 'all' as const, label: '전체' },
            { value: '작업중' as const, label: '작업중' },
            { value: '작업 완료' as const, label: '작업 완료' },
          ]).map(f => (
            <button key={f.value} onClick={() => setStatusFilter(f.value)}
              className={`px-3.5 py-1.5 text-sm font-medium rounded-full border transition-all duration-200 ${statusFilter === f.value ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-100' : 'bg-white/60 dark:bg-white/5 backdrop-blur-sm text-zinc-500 dark:text-zinc-400 border-black/[0.12] dark:border-white/[0.12] hover:border-zinc-400 dark:hover:border-zinc-500'}`}>
              {f.label} <span className="ml-1 tabular-nums">{statusCounts[f.value] ?? 0}</span>
            </button>
          ))}
          <span className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 mx-1" />
          <span className="text-xs text-zinc-400 dark:text-zinc-500 mr-1 font-medium">레이블</span>
          {([
            { value: 'all' as const, label: '전체' },
            ...TEAM_LABELS.map(l => ({ value: l, label: l })),
          ]).map(f => (
            <button key={f.value} onClick={() => setLabelFilter(f.value)}
              className={`px-3.5 py-1.5 text-sm font-medium rounded-full border transition-all duration-200 ${labelFilter === f.value ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-100' : 'bg-white/60 dark:bg-white/5 backdrop-blur-sm text-zinc-500 dark:text-zinc-400 border-black/[0.12] dark:border-white/[0.12] hover:border-zinc-400 dark:hover:border-zinc-500'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filteredWorks.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-base text-zinc-400">
          {allTrackedWorks.length === 0 ? '등록된 트래킹 작품이 없습니다' : '검색 결과가 없습니다'}
        </div>
      ) : (
        <div className="flex gap-5 items-start">
          {/* Left: Work List */}
          <div className="w-[800px] flex-shrink-0 space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
            {workSummaries.map((ws, i) => {
              const info = titleMap.get(ws.name);
              const slug = getSlugByWorkName(ws.name);
              const isSelected = currentWork?.name === ws.name;
              return (
                <button key={ws.name} onClick={() => setSelectedWork(ws.name)}
                  className={`w-full text-left rounded-2xl p-3.5 transition-all duration-200 ${
                    isSelected
                      ? 'bg-white/80 dark:bg-white/10 backdrop-blur-xl border border-cyan-300/60 dark:border-cyan-500/30 shadow-lg shadow-cyan-500/[0.08] ring-2 ring-cyan-500/20'
                      : 'bg-white/60 dark:bg-white/5 backdrop-blur-xl border border-white/60 dark:border-white/10 shadow-md shadow-black/[0.03] hover:shadow-lg hover:shadow-black/[0.06] hover:-translate-y-0.5'
                  }`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span
                      onClick={(e) => toggleCompare(ws.name, e)}
                      className={`flex items-center justify-center h-4 w-4 rounded border-2 text-[10px] font-bold cursor-pointer transition-all duration-200 flex-shrink-0 ${
                        compareSet.has(ws.name)
                          ? 'bg-cyan-500 border-cyan-500 text-white'
                          : 'border-zinc-300 dark:border-zinc-600 text-transparent hover:border-cyan-400'
                      }`}
                    >
                      ✓
                    </span>
                    <span className={`text-base font-bold tabular-nums ${i === 0 ? 'text-amber-500' : i < 3 ? 'text-zinc-400' : 'text-zinc-300 dark:text-zinc-600'}`}>{i + 1}</span>
                    {slug ? (
                      <Link href={`/accounting/sales/master/${slug}`} onClick={e => e.stopPropagation()}
                        className="text-base font-bold text-zinc-900 dark:text-zinc-100 hover:text-cyan-600 dark:hover:text-cyan-400 hover:underline transition-colors truncate">
                        {ws.name}
                      </Link>
                    ) : (
                      <span className="text-base font-bold text-zinc-900 dark:text-zinc-100 truncate">{ws.name}</span>
                    )}
                    {(() => {
                      const tw = allTrackedWorks.find(w => w.name === ws.name);
                      const isComplete = tw && tw.entries.length >= 28;
                      return (
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${isComplete ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'}`}>
                          {isComplete ? '작업 완료' : '작업중'}
                        </span>
                      );
                    })()}
                    {info?.teamLabel && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-500 dark:text-blue-400 font-medium">{info.teamLabel}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-zinc-400 dark:text-zinc-500">
                    <span>런칭: {allTrackedWorks.find(w => w.name === ws.name)?.launchDate || ''}</span>
                    {(() => { const tw = allTrackedWorks.find(w => w.name === ws.name); if (!tw || tw.entries.length === 0) return null; const sorted = tw.entries.map(e => e.date).sort(); return <span>{sorted[0]} ~ {sorted[sorted.length - 1]}</span>; })()}
                    <span className="ml-auto" />
                    <div className="flex gap-5 text-right">
                      <div>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500">네이버 매출</p>
                        <p className="text-base font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{fmtShortComma(ws.total)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500">수수료</p>
                        <p className="text-base font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{fmtShortComma(ws.fee)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500">더그림 매출</p>
                        <p className="text-base font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{fmtShortComma(ws.grimSales)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500">주간 평균</p>
                        <p className="text-base font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{fmtShortComma(ws.weeklyAvg)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500">일 평균</p>
                        <p className="text-base font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{fmtShortComma(ws.dailyAvg)}</p>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right: Detail / Compare */}
          <div className="flex-1 min-w-0 space-y-4">
            {compareSet.size >= 2 && (
              <div className="rounded-2xl bg-white/70 dark:bg-white/5 backdrop-blur-xl border border-white/60 dark:border-white/10 shadow-lg shadow-black/[0.03] overflow-hidden sticky top-4">
                <div className="px-5 py-4 border-b border-white/30 dark:border-white/[0.06] flex items-center justify-between">
                  <h2 className="text-xl font-semibold tracking-tight">작품 비교 (D+0 ~ D+27)</h2>
                  <button
                    onClick={() => setCompareSet(new Set())}
                    className="text-sm text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                  >
                    비교 해제
                  </button>
                </div>
                <div className="p-5">
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {compareNames.map((name, i) => (
                      <span key={name} className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full text-white"
                        style={{ backgroundColor: WORK_COLORS[i % WORK_COLORS.length] }}>
                        {name}
                      </span>
                    ))}
                  </div>
                  <div className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={compareChartData}>
                        <CartesianGrid vertical={false} stroke="currentColor" className="text-zinc-100 dark:text-zinc-800" />
                        <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#8E8E93' }} dy={8} interval={3} />
                        <YAxis tickFormatter={fmtShort} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#8E8E93' }} width={55} tickCount={5} />
                        <Tooltip
                          contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', backdropFilter: 'blur(16px)', background: 'rgba(255,255,255,0.9)' }}
                          formatter={(value: unknown, name: unknown) => [fmtShortComma(Number(value)), String(name)]}
                        />
                        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 16 }} />
                        {compareNames.map((name, i) => {
                          const color = WORK_COLORS[i % WORK_COLORS.length];
                          return (
                            <Line
                              key={name}
                              type="monotone"
                              dataKey={name}
                              stroke={color}
                              strokeWidth={2}
                              dot={false}
                              activeDot={{ r: 5, strokeWidth: 2, fill: '#fff', stroke: color }}
                            />
                          );
                        })}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}
            {currentWork && (
              <div className="rounded-2xl bg-white/70 dark:bg-white/5 backdrop-blur-xl border border-white/60 dark:border-white/10 shadow-lg shadow-black/[0.03] overflow-hidden sticky top-4">
                <div className="px-5 py-4 border-b border-white/30 dark:border-white/[0.06] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {(() => { const slug = getSlugByWorkName(currentWork.name); return slug ? (
                      <Link href={`/accounting/sales/master/${slug}`} className="text-xl font-semibold tracking-tight hover:text-cyan-600 dark:hover:text-cyan-400 hover:underline transition-colors">
                        {currentWork.name}
                      </Link>
                    ) : (
                      <h2 className="text-xl font-semibold tracking-tight">{currentWork.name}</h2>
                    ); })()}
                  </div>
                  <span className="text-base text-zinc-400">{currentWork.launchDate} 런칭</span>
                </div>
                <div className="overflow-y-auto max-h-[calc(100vh-340px)]">
                  <table className="w-full text-base">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-zinc-800 dark:bg-zinc-800 text-white">
                        <th className="px-4 py-3 text-left font-semibold text-sm">
                          {periodMode === 'daily' ? '날짜' : '구분'}
                        </th>
                        {periodMode === 'daily' && <th className="px-4 py-3 text-center font-semibold text-sm">D+</th>}
                        {periodMode !== 'daily' && <th className="px-4 py-3 text-left font-semibold text-sm">기간</th>}
                        <th className="px-4 py-3 text-right font-semibold text-sm">네이버 매출</th>
                        <th className="px-4 py-3 text-right font-semibold text-sm border-l-2 border-zinc-600">수수료 (10%)</th>
                        <th className="px-4 py-3 text-right font-semibold text-sm border-l-2 border-zinc-600">더그림 매출</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {tableRows.map((r, i) => (
                        <tr key={i} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                          <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400 tabular-nums">{r.label}</td>
                          {periodMode === 'daily' && <td className="px-4 py-3 text-center text-zinc-400 dark:text-zinc-500 tabular-nums text-sm">{r.sub}</td>}
                          {periodMode !== 'daily' && <td className="px-4 py-3 text-zinc-400 dark:text-zinc-500 text-sm">{r.sub}</td>}
                          <td className="px-4 py-3 text-right tabular-nums font-medium text-zinc-900 dark:text-zinc-100">{fmtComma(r.amount)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-zinc-900 dark:text-zinc-100 border-l-2 border-zinc-200 dark:border-zinc-700">{fmtComma(r.fee)}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-bold text-zinc-900 dark:text-zinc-100 border-l-2 border-zinc-200 dark:border-zinc-700">{fmtComma(r.grimSales)}</td>
                        </tr>
                      ))}
                    </tbody>
                    {periodMode !== 'total' && (
                      <tfoot>
                        <tr className="bg-zinc-50 dark:bg-zinc-800/50 font-bold border-t-2 border-zinc-300 dark:border-zinc-600">
                          <td className="px-4 py-3 text-zinc-900 dark:text-zinc-100">합계</td>
                          <td className="px-4 py-3 text-center text-zinc-400 text-sm">{tableTotals.days}일</td>
                          <td className="px-4 py-3 text-right tabular-nums text-zinc-900 dark:text-zinc-100">{fmtComma(tableTotals.amount)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-zinc-900 dark:text-zinc-100 border-l-2 border-zinc-200 dark:border-zinc-700">{fmtComma(tableTotals.fee)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-zinc-900 dark:text-zinc-100 border-l-2 border-zinc-200 dark:border-zinc-700">{fmtComma(tableTotals.grim)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
