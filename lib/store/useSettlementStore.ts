import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettlementState {
  selectedMonth: string; // YYYY-MM
  setSelectedMonth: (month: string) => void;
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export const useSettlementStore = create<SettlementState>()(
  persist(
    (set) => ({
      selectedMonth: getCurrentMonth(),
      setSelectedMonth: (month) => set({ selectedMonth: month }),
    }),
    {
      name: 'settlement-month',
      partialize: (state) => ({ selectedMonth: state.selectedMonth }),
    }
  )
);
