import { z } from "zod";
export const loginSchema = z.object({ email: z.string().email("Enter a valid email"), password: z.string().min(8, "Password must be at least 8 characters") });
export const registerSchema = z.object({ name: z.string().trim().min(2, "Enter your name"), email: z.string().email("Enter a valid email"), password: z.string().min(8, "Use at least 8 characters") });
export const checkoutSchema = z.object({ name: z.string().trim().min(2), line1: z.string().trim().min(3, "Enter a street address"), city: z.string().trim().min(2), region: z.string().trim().min(2), postalCode: z.string().trim().min(4), country: z.string().trim().min(2), paymentMethod: z.enum(["UPI", "CARD", "COD"]) });
export const profileSchema = z.object({ name: z.string().trim().min(2), phone: z.string().optional() });
