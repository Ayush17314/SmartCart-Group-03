import { create } from "zustand";
type UIState = { cartOpen: boolean; searchOpen: boolean; setCartOpen: (open: boolean) => void; setSearchOpen: (open: boolean) => void };
export const useUI = create<UIState>((set) => ({ cartOpen: false, searchOpen: false, setCartOpen: (cartOpen) => set({ cartOpen }), setSearchOpen: (searchOpen) => set({ searchOpen }) }));
