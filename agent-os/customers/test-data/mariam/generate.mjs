#!/usr/bin/env node

/**
 * Mariam's Abaya Boutique Test Data Generator
 * Generates realistic (and intentionally messy) migration data for Mariam's
 * 2-store UAE abaya/modest-fashion boutique (Dubai Jumeirah + Sharjah Al Majaz).
 * Deterministic: seeded PRNG ensures reproducibility.
 * Seed: 43
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

const CONFIG = {
  seed: 43,
  customerCount: 600,
  supplierCount: 15,
  customOrderCount: 40,
};

// Fashion categories for abaya boutique
const CATEGORIES_BASE = [
  // Top-level
  { name: 'Abayas', ar: 'عباءات', parent: '' },
  { name: 'Kaftans', ar: 'قفاطين', parent: '' },
  { name: 'Jalabiyas', ar: 'جلابيات', parent: '' },
  { name: 'Modest Tops', ar: 'بلوزات محتشمة', parent: '' },
  { name: 'Hijabs & Shaylas', ar: 'حجاب وشيلان', parent: '' },
  { name: 'Underscarves', ar: 'البونيه', parent: '' },
  { name: 'Accessories', ar: 'إكسسوارات', parent: '' },
  { name: 'Fabrics', ar: 'أقمشة', parent: '' },
  // Children of Abayas
  { name: 'Classic Abayas', ar: 'عباءات كلاسيكية', parent: 'Abayas' },
  { name: 'Embroidered Abayas', ar: 'عباءات مطرزة', parent: 'Abayas' },
  { name: 'Butterfly Abayas', ar: 'عباءات فراشة', parent: 'Abayas' },
  // Children of Kaftans
  { name: 'Occasion Kaftans', ar: 'قفاطين مناسبات', parent: 'Kaftans' },
  { name: 'Casual Kaftans', ar: 'قفاطين كاجوال', parent: 'Kaftans' },
  // Children of Accessories
  { name: 'Brooches & Pins', ar: 'بروشات ودبابيس', parent: 'Accessories' },
  { name: 'Belts & Sashes', ar: 'أحزمة وأوشحة', parent: 'Accessories' },
];

// Expanded abaya styles for SKU generation (~120 styles total)
const ABAYA_STYLES = [
  // Classic Abayas – Crepe variants (10)
  { code: 'CCR', name: 'Classic Crepe Abaya', ar: 'عباءة كريب كلاسيكية', basePrice: 185, category: 'Classic Abayas', fabric: 'Crepe' },
  { code: 'CCR2', name: 'Classic Crepe Abaya Slim', ar: 'عباءة كريب سليم', basePrice: 190, category: 'Classic Abayas', fabric: 'Crepe' },
  { code: 'CCR3', name: 'Classic Crepe Abaya Flared', ar: 'عباءة كريب مبضعة', basePrice: 195, category: 'Classic Abayas', fabric: 'Crepe' },
  { code: 'CCR4', name: 'Crepe Abaya Side Slit', ar: 'عباءة كريب بشق جانبي', basePrice: 200, category: 'Classic Abayas', fabric: 'Crepe' },
  { code: 'CCR5', name: 'Crepe Abaya Front Zip', ar: 'عباءة كريب بسحاب أمامي', basePrice: 205, category: 'Classic Abayas', fabric: 'Crepe' },
  { code: 'CCR6', name: 'Crepe Abaya Bell Sleeve', ar: 'عباءة كريب كم جرس', basePrice: 210, category: 'Classic Abayas', fabric: 'Crepe' },
  { code: 'CCR7', name: 'Crepe Abaya Kimono Sleeve', ar: 'عباءة كريب كم كيمونو', basePrice: 215, category: 'Classic Abayas', fabric: 'Crepe' },
  { code: 'CCR8', name: 'Crepe Abaya Wide Leg', ar: 'عباءة كريب بنطلون واسع', basePrice: 220, category: 'Classic Abayas', fabric: 'Crepe' },
  { code: 'CCR9', name: 'Crepe Abaya Longline', ar: 'عباءة كريب طويلة', basePrice: 225, category: 'Classic Abayas', fabric: 'Crepe' },
  { code: 'CCR10', name: 'Crepe Abaya High Neck', ar: 'عباءة كريب ياقة عالية', basePrice: 230, category: 'Classic Abayas', fabric: 'Crepe' },
  // Classic Abayas – Nida variants (8)
  { code: 'CND', name: 'Classic Nida Abaya', ar: 'عباءة نيدا كلاسيكية', basePrice: 165, category: 'Classic Abayas', fabric: 'Nida' },
  { code: 'CND2', name: 'Nida Abaya Slim Cut', ar: 'عباءة نيدا قصة سليم', basePrice: 170, category: 'Classic Abayas', fabric: 'Nida' },
  { code: 'CND3', name: 'Nida Abaya Pleated', ar: 'عباءة نيدا مكرمشة', basePrice: 175, category: 'Classic Abayas', fabric: 'Nida' },
  { code: 'CND4', name: 'Nida Abaya Open Front', ar: 'عباءة نيدا مفتوحة الأمام', basePrice: 180, category: 'Classic Abayas', fabric: 'Nida' },
  { code: 'CND5', name: 'Nida Abaya Tie Front', ar: 'عباءة نيدا بربطة أمامية', basePrice: 185, category: 'Classic Abayas', fabric: 'Nida' },
  { code: 'CND6', name: 'Nida Abaya Drop Shoulder', ar: 'عباءة نيدا كتف منسدل', basePrice: 190, category: 'Classic Abayas', fabric: 'Nida' },
  { code: 'CND7', name: 'Nida Abaya Button Front', ar: 'عباءة نيدا بأزرار أمامية', basePrice: 195, category: 'Classic Abayas', fabric: 'Nida' },
  { code: 'CND8', name: 'Nida Abaya Sash Belt', ar: 'عباءة نيدا بحزام وشاح', basePrice: 200, category: 'Classic Abayas', fabric: 'Nida' },
  // Classic Abayas – Satin variants (6)
  { code: 'CST', name: 'Classic Satin Abaya', ar: 'عباءة ساتان كلاسيكية', basePrice: 210, category: 'Classic Abayas', fabric: 'Satin' },
  { code: 'CST2', name: 'Satin Abaya Glossy Trim', ar: 'عباءة ساتان بحافة لامعة', basePrice: 220, category: 'Classic Abayas', fabric: 'Satin' },
  { code: 'CST3', name: 'Satin Abaya Matte Finish', ar: 'عباءة ساتان مط', basePrice: 215, category: 'Classic Abayas', fabric: 'Satin' },
  { code: 'CST4', name: 'Satin Abaya Ruched Side', ar: 'عباءة ساتان بكشكش جانبي', basePrice: 225, category: 'Classic Abayas', fabric: 'Satin' },
  { code: 'CST5', name: 'Satin Abaya Wrap Style', ar: 'عباءة ساتان لف', basePrice: 230, category: 'Classic Abayas', fabric: 'Satin' },
  { code: 'CST6', name: 'Satin Abaya Cape Back', ar: 'عباءة ساتان كيب خلفي', basePrice: 240, category: 'Classic Abayas', fabric: 'Satin' },
  // Classic Abayas – Velvet variants (5)
  { code: 'CVL', name: 'Classic Velvet Abaya', ar: 'عباءة مخمل كلاسيكية', basePrice: 280, category: 'Classic Abayas', fabric: 'Velvet' },
  { code: 'CVL2', name: 'Velvet Abaya Embossed', ar: 'عباءة مخمل منقوش', basePrice: 295, category: 'Classic Abayas', fabric: 'Velvet' },
  { code: 'CVL3', name: 'Velvet Abaya Crushed', ar: 'عباءة مخمل مجعد', basePrice: 290, category: 'Classic Abayas', fabric: 'Velvet' },
  { code: 'CVL4', name: 'Velvet Abaya Burnout', ar: 'عباءة مخمل بارنوت', basePrice: 310, category: 'Classic Abayas', fabric: 'Velvet' },
  { code: 'CVL5', name: 'Velvet Abaya Striped', ar: 'عباءة مخمل مخططة', basePrice: 285, category: 'Classic Abayas', fabric: 'Velvet' },
  // Embroidered Abayas (14)
  { code: 'EGD', name: 'Embroidered Gold Trim Abaya', ar: 'عباءة بتطريز ذهبي', basePrice: 320, category: 'Embroidered Abayas', fabric: 'Crepe' },
  { code: 'EGD2', name: 'Gold Embroidered Cuff Abaya', ar: 'عباءة تطريز كف ذهبي', basePrice: 335, category: 'Embroidered Abayas', fabric: 'Crepe' },
  { code: 'EGD3', name: 'Gold Lattice Embroidered Abaya', ar: 'عباءة شبكة ذهبية', basePrice: 350, category: 'Embroidered Abayas', fabric: 'Nida' },
  { code: 'ESL', name: 'Embroidered Silver Trim Abaya', ar: 'عباءة بتطريز فضي', basePrice: 295, category: 'Embroidered Abayas', fabric: 'Nida' },
  { code: 'ESL2', name: 'Silver Border Abaya', ar: 'عباءة بحدود فضية', basePrice: 310, category: 'Embroidered Abayas', fabric: 'Crepe' },
  { code: 'ESL3', name: 'Silver Scatter Embroidery Abaya', ar: 'عباءة تطريز فضي منتشر', basePrice: 325, category: 'Embroidered Abayas', fabric: 'Satin' },
  { code: 'EFL', name: 'Floral Embroidered Abaya', ar: 'عباءة بتطريز زهري', basePrice: 340, category: 'Embroidered Abayas', fabric: 'Chiffon' },
  { code: 'EFL2', name: 'Floral Vine Embroidered Abaya', ar: 'عباءة تطريز كرمة زهور', basePrice: 355, category: 'Embroidered Abayas', fabric: 'Chiffon' },
  { code: 'EGM', name: 'Geometric Embroidered Abaya', ar: 'عباءة بتطريز هندسي', basePrice: 330, category: 'Embroidered Abayas', fabric: 'Crepe' },
  { code: 'EGM2', name: 'Diamond Geo Embroidered Abaya', ar: 'عباءة تطريز هندسي ألماسي', basePrice: 345, category: 'Embroidered Abayas', fabric: 'Nida' },
  { code: 'EPS', name: 'Paisley Embroidered Abaya', ar: 'عباءة تطريز بيزلي', basePrice: 360, category: 'Embroidered Abayas', fabric: 'Velvet' },
  { code: 'EBD', name: 'Beaded Embroidered Abaya', ar: 'عباءة تطريز خرز', basePrice: 420, category: 'Embroidered Abayas', fabric: 'Crepe' },
  { code: 'EBD2', name: 'Crystal Bead Abaya', ar: 'عباءة خرز كريستال', basePrice: 460, category: 'Embroidered Abayas', fabric: 'Satin' },
  { code: 'EMX', name: 'Mixed Media Embroidered Abaya', ar: 'عباءة تطريز مواد متعددة', basePrice: 400, category: 'Embroidered Abayas', fabric: 'Chiffon' },
  // Butterfly Abayas (10)
  { code: 'BFT', name: 'Butterfly Open Abaya', ar: 'عباءة فراشة مفتوحة', basePrice: 240, category: 'Butterfly Abayas', fabric: 'Chiffon' },
  { code: 'BFT2', name: 'Butterfly Chiffon Layered', ar: 'عباءة فراشة شيفون طبقات', basePrice: 255, category: 'Butterfly Abayas', fabric: 'Chiffon' },
  { code: 'BFT3', name: 'Butterfly Abaya Ombre', ar: 'عباءة فراشة أومبريه', basePrice: 270, category: 'Butterfly Abayas', fabric: 'Chiffon' },
  { code: 'BFC', name: 'Butterfly Crepe Abaya', ar: 'عباءة فراشة كريب', basePrice: 220, category: 'Butterfly Abayas', fabric: 'Crepe' },
  { code: 'BFC2', name: 'Butterfly Crepe Belted', ar: 'عباءة فراشة كريب بحزام', basePrice: 235, category: 'Butterfly Abayas', fabric: 'Crepe' },
  { code: 'BFN', name: 'Butterfly Nida Abaya', ar: 'عباءة فراشة نيدا', basePrice: 215, category: 'Butterfly Abayas', fabric: 'Nida' },
  { code: 'BFN2', name: 'Butterfly Nida Double Layer', ar: 'عباءة فراشة نيدا طبقتين', basePrice: 230, category: 'Butterfly Abayas', fabric: 'Nida' },
  { code: 'BFS', name: 'Butterfly Satin Abaya', ar: 'عباءة فراشة ساتان', basePrice: 260, category: 'Butterfly Abayas', fabric: 'Satin' },
  { code: 'BFE', name: 'Butterfly Embroidered Open', ar: 'عباءة فراشة مطرزة مفتوحة', basePrice: 310, category: 'Butterfly Abayas', fabric: 'Chiffon' },
  { code: 'BFP', name: 'Butterfly Pleated Abaya', ar: 'عباءة فراشة مكرمشة', basePrice: 245, category: 'Butterfly Abayas', fabric: 'Crepe' },
  // Kaftans – Occasion (10)
  { code: 'OCK', name: 'Occasion Kaftan Velvet', ar: 'قفطان مناسبات مخمل', basePrice: 380, category: 'Occasion Kaftans', fabric: 'Velvet' },
  { code: 'OCK2', name: 'Occasion Kaftan Silk', ar: 'قفطان مناسبات حرير', basePrice: 420, category: 'Occasion Kaftans', fabric: 'Silk' },
  { code: 'OCK3', name: 'Occasion Kaftan Sequin', ar: 'قفطان مناسبات ترتر', basePrice: 460, category: 'Occasion Kaftans', fabric: 'Sequin' },
  { code: 'OCK4', name: 'Occasion Kaftan Brocade', ar: 'قفطان مناسبات بروكيد', basePrice: 440, category: 'Occasion Kaftans', fabric: 'Brocade' },
  { code: 'OCK5', name: 'Occasion Kaftan Embroidered', ar: 'قفطان مناسبات مطرز', basePrice: 480, category: 'Occasion Kaftans', fabric: 'Velvet' },
  { code: 'OCK6', name: 'Occasion Kaftan Lace', ar: 'قفطان مناسبات دانتيل', basePrice: 395, category: 'Occasion Kaftans', fabric: 'Lace' },
  { code: 'OCK7', name: 'Occasion Kaftan Chiffon', ar: 'قفطان مناسبات شيفون', basePrice: 360, category: 'Occasion Kaftans', fabric: 'Chiffon' },
  { code: 'OCK8', name: 'Occasion Kaftan Crystal', ar: 'قفطان مناسبات كريستال', basePrice: 520, category: 'Occasion Kaftans', fabric: 'Sequin' },
  { code: 'OCK9', name: 'Occasion Kaftan Printed', ar: 'قفطان مناسبات مطبوع', basePrice: 340, category: 'Occasion Kaftans', fabric: 'Crepe' },
  { code: 'OCK10', name: 'Occasion Kaftan Geometric', ar: 'قفطان مناسبات هندسي', basePrice: 370, category: 'Occasion Kaftans', fabric: 'Satin' },
  // Kaftans – Casual (8)
  { code: 'CKF', name: 'Casual Kaftan Linen', ar: 'قفطان كاجوال كتان', basePrice: 195, category: 'Casual Kaftans', fabric: 'Linen' },
  { code: 'CKF2', name: 'Casual Kaftan Cotton', ar: 'قفطان كاجوال قطن', basePrice: 175, category: 'Casual Kaftans', fabric: 'Cotton' },
  { code: 'CKF3', name: 'Casual Kaftan Embroidered Hem', ar: 'قفطان كاجوال بحافة مطرزة', basePrice: 215, category: 'Casual Kaftans', fabric: 'Linen' },
  { code: 'CKF4', name: 'Casual Kaftan Striped', ar: 'قفطان كاجوال مخطط', basePrice: 185, category: 'Casual Kaftans', fabric: 'Cotton' },
  { code: 'CKF5', name: 'Casual Kaftan Printed Floral', ar: 'قفطان كاجوال مطبوع زهور', basePrice: 200, category: 'Casual Kaftans', fabric: 'Cotton' },
  { code: 'CKF6', name: 'Casual Kaftan Tie Dye', ar: 'قفطان كاجوال تاي داي', basePrice: 190, category: 'Casual Kaftans', fabric: 'Cotton' },
  { code: 'CKF7', name: 'Casual Kaftan Split Hem', ar: 'قفطان كاجوال بشق', basePrice: 205, category: 'Casual Kaftans', fabric: 'Linen' },
  { code: 'CKF8', name: 'Casual Kaftan Jersey', ar: 'قفطان كاجوال جيرسيه', basePrice: 165, category: 'Casual Kaftans', fabric: 'Jersey' },
  // Jalabiyas (10)
  { code: 'OCJ', name: 'Jalabiya Traditional', ar: 'جلابية تقليدية', basePrice: 275, category: 'Jalabiyas', fabric: 'Cotton' },
  { code: 'OCJ2', name: 'Jalabiya Embroidered Neckline', ar: 'جلابية ياقة مطرزة', basePrice: 295, category: 'Jalabiyas', fabric: 'Cotton' },
  { code: 'OCJ3', name: 'Jalabiya Moroccan Style', ar: 'جلابية مغربية', basePrice: 310, category: 'Jalabiyas', fabric: 'Wool' },
  { code: 'OCJ4', name: 'Jalabiya Cotton Printed', ar: 'جلابية قطن مطبوعة', basePrice: 260, category: 'Jalabiyas', fabric: 'Cotton' },
  { code: 'OCJ5', name: 'Jalabiya Linen Classic', ar: 'جلابية كتان كلاسيكية', basePrice: 280, category: 'Jalabiyas', fabric: 'Linen' },
  { code: 'OCJ6', name: 'Jalabiya Velvet Occasion', ar: 'جلابية مخمل مناسبات', basePrice: 350, category: 'Jalabiyas', fabric: 'Velvet' },
  { code: 'OCJ7', name: 'Jalabiya Tie Back', ar: 'جلابية ربطة خلفية', basePrice: 285, category: 'Jalabiyas', fabric: 'Cotton' },
  { code: 'OCJ8', name: 'Jalabiya Satin Modern', ar: 'جلابية ساتان عصرية', basePrice: 300, category: 'Jalabiyas', fabric: 'Satin' },
  { code: 'OCJ9', name: 'Jalabiya Flared Hem', ar: 'جلابية بحافة مبضعة', basePrice: 270, category: 'Jalabiyas', fabric: 'Linen' },
  { code: 'OCJ10', name: 'Jalabiya Side Embroidery', ar: 'جلابية تطريز جانبي', basePrice: 315, category: 'Jalabiyas', fabric: 'Cotton' },
  // Modest Tops (10)
  { code: 'MTB', name: 'Modest Top Basic', ar: 'بلوزة محتشمة بيسك', basePrice: 95, category: 'Modest Tops', fabric: 'Cotton' },
  { code: 'MTB2', name: 'Modest Top Layered', ar: 'بلوزة محتشمة طبقات', basePrice: 110, category: 'Modest Tops', fabric: 'Chiffon' },
  { code: 'MTB3', name: 'Modest Top Flowy', ar: 'بلوزة محتشمة منسابة', basePrice: 120, category: 'Modest Tops', fabric: 'Crepe' },
  { code: 'MTL', name: 'Modest Top Linen', ar: 'بلوزة محتشمة كتان', basePrice: 125, category: 'Modest Tops', fabric: 'Linen' },
  { code: 'MTL2', name: 'Modest Top Linen Embroidered', ar: 'بلوزة كتان مطرزة', basePrice: 140, category: 'Modest Tops', fabric: 'Linen' },
  { code: 'MTS', name: 'Modest Top Satin', ar: 'بلوزة محتشمة ساتان', basePrice: 135, category: 'Modest Tops', fabric: 'Satin' },
  { code: 'MTS2', name: 'Modest Top Satin Wrap', ar: 'بلوزة ساتان لف', basePrice: 145, category: 'Modest Tops', fabric: 'Satin' },
  { code: 'MTC', name: 'Modest Top Crepe Bishop Sleeve', ar: 'بلوزة كريب كم أسقف', basePrice: 130, category: 'Modest Tops', fabric: 'Crepe' },
  { code: 'MTC2', name: 'Modest Top Crepe Ruffled', ar: 'بلوزة كريب بكشكش', basePrice: 135, category: 'Modest Tops', fabric: 'Crepe' },
  { code: 'MTJ', name: 'Modest Top Jersey Long', ar: 'بلوزة جيرسيه طويلة', basePrice: 85, category: 'Modest Tops', fabric: 'Jersey' },
  // Linen specialty (6)
  { code: 'LNA', name: 'Linen Abaya Relaxed', ar: 'عباءة كتان مريحة', basePrice: 235, category: 'Classic Abayas', fabric: 'Linen' },
  { code: 'LNA2', name: 'Linen Abaya Striped', ar: 'عباءة كتان مخططة', basePrice: 245, category: 'Classic Abayas', fabric: 'Linen' },
  { code: 'LNA3', name: 'Linen Abaya Embroidered Hem', ar: 'عباءة كتان بحافة مطرزة', basePrice: 265, category: 'Classic Abayas', fabric: 'Linen' },
  { code: 'LNA4', name: 'Linen Abaya Patch Pocket', ar: 'عباءة كتان بجيب مربع', basePrice: 240, category: 'Classic Abayas', fabric: 'Linen' },
  { code: 'LNA5', name: 'Linen Abaya Collarless', ar: 'عباءة كتان بدون ياقة', basePrice: 250, category: 'Classic Abayas', fabric: 'Linen' },
  { code: 'LNA6', name: 'Linen Abaya Pintuck', ar: 'عباءة كتان بنقشة', basePrice: 260, category: 'Classic Abayas', fabric: 'Linen' },
  // Chiffon specialty (5)
  { code: 'CHA', name: 'Chiffon Layered Abaya', ar: 'عباءة شيفون طبقات', basePrice: 255, category: 'Classic Abayas', fabric: 'Chiffon' },
  { code: 'CHA2', name: 'Chiffon Kimono Abaya', ar: 'عباءة كيمونو شيفون', basePrice: 265, category: 'Classic Abayas', fabric: 'Chiffon' },
  { code: 'CHA3', name: 'Chiffon Open Abaya Printed', ar: 'عباءة شيفون مفتوحة مطبوعة', basePrice: 275, category: 'Classic Abayas', fabric: 'Chiffon' },
  { code: 'CHA4', name: 'Chiffon Abaya Cape Style', ar: 'عباءة كيب شيفون', basePrice: 280, category: 'Classic Abayas', fabric: 'Chiffon' },
  { code: 'CHA5', name: 'Chiffon Waterfall Abaya', ar: 'عباءة شلال شيفون', basePrice: 270, category: 'Classic Abayas', fabric: 'Chiffon' },
  // Jersey & Knit specialty (4)
  { code: 'JKA', name: 'Jersey Knit Abaya', ar: 'عباءة جيرسيه', basePrice: 160, category: 'Classic Abayas', fabric: 'Jersey' },
  { code: 'JKA2', name: 'Jersey Abaya Zip Front', ar: 'عباءة جيرسيه بسحاب', basePrice: 175, category: 'Classic Abayas', fabric: 'Jersey' },
  { code: 'JKA3', name: 'Jersey Abaya Maxi', ar: 'عباءة جيرسيه ماكسي', basePrice: 165, category: 'Classic Abayas', fabric: 'Jersey' },
  { code: 'JKA4', name: 'Ponte Knit Abaya', ar: 'عباءة بونتي نيت', basePrice: 185, category: 'Classic Abayas', fabric: 'Jersey' },
];

const COLORS = [
  { code: 'BLK', name: 'Black', ar: 'أسود' },
  { code: 'NVY', name: 'Navy', ar: 'كحلي' },
  { code: 'ABY', name: 'Abaya Blue', ar: 'أزرق عباءة' },
  { code: 'GRY', name: 'Charcoal Grey', ar: 'رمادي فحمي' },
  { code: 'DGN', name: 'Dark Green', ar: 'أخضر داكن' },
  { code: 'BRG', name: 'Burgundy', ar: 'بردوني' },
  { code: 'BGE', name: 'Beige', ar: 'بيج' },
  { code: 'WHT', name: 'White', ar: 'أبيض' },
  { code: 'OLV', name: 'Olive', ar: 'أخضر زيتوني' },
  { code: 'DPK', name: 'Dusty Pink', ar: 'وردي غبار' },
  { code: 'CAM', name: 'Camel', ar: 'جملي' },
  { code: 'PLM', name: 'Plum', ar: 'بنفسجي داكن' },
];

const SIZES = ['52', '54', '56', '58', '60', '62'];

const ACCESSORY_ITEMS = [
  { code: 'SHL', name: 'Shayla Plain', ar: 'شيلة سادة', basePrice: 35, category: 'Hijabs & Shaylas' },
  { code: 'SHE', name: 'Shayla Embroidered', ar: 'شيلة مطرزة', basePrice: 65, category: 'Hijabs & Shaylas' },
  { code: 'SHL2', name: 'Shayla Printed', ar: 'شيلة مطبوعة', basePrice: 45, category: 'Hijabs & Shaylas' },
  { code: 'SHL3', name: 'Shayla Chiffon Luxe', ar: 'شيلة شيفون فاخرة', basePrice: 55, category: 'Hijabs & Shaylas' },
  { code: 'SHL4', name: 'Shayla Georgette', ar: 'شيلة جورجيت', basePrice: 48, category: 'Hijabs & Shaylas' },
  { code: 'SHL5', name: 'Shayla Satin Trim', ar: 'شيلة بحافة ساتان', basePrice: 52, category: 'Hijabs & Shaylas' },
  { code: 'HJB', name: 'Jersey Hijab', ar: 'حجاب جيرسيه', basePrice: 28, category: 'Hijabs & Shaylas' },
  { code: 'HJB2', name: 'Jersey Hijab Premium', ar: 'حجاب جيرسيه فاخر', basePrice: 35, category: 'Hijabs & Shaylas' },
  { code: 'HJB3', name: 'Jersey Hijab Tube', ar: 'حجاب جيرسيه أنبوبي', basePrice: 22, category: 'Hijabs & Shaylas' },
  { code: 'HJP', name: 'Hijab Pashmina', ar: 'حجاب باشمينا', basePrice: 75, category: 'Hijabs & Shaylas' },
  { code: 'HJP2', name: 'Hijab Pashmina Embroidered', ar: 'حجاب باشمينا مطرز', basePrice: 95, category: 'Hijabs & Shaylas' },
  { code: 'UND', name: 'Underscarf Tube', ar: 'بونيه أنبوبي', basePrice: 15, category: 'Underscarves' },
  { code: 'UNL', name: 'Underscarf Lace', ar: 'بونيه دانتيل', basePrice: 22, category: 'Underscarves' },
  { code: 'UNC', name: 'Underscarf Cotton', ar: 'بونيه قطن', basePrice: 12, category: 'Underscarves' },
  { code: 'UNB', name: 'Underscarf Bamboo', ar: 'بونيه بامبو', basePrice: 18, category: 'Underscarves' },
  { code: 'UNV', name: 'Underscarf Velvet Band', ar: 'بونيه شريط مخمل', basePrice: 20, category: 'Underscarves' },
  { code: 'BRP', name: 'Pearl Brooch', ar: 'بروش لؤلؤ', basePrice: 45, category: 'Brooches & Pins' },
  { code: 'BRC', name: 'Crystal Brooch', ar: 'بروش كريستال', basePrice: 55, category: 'Brooches & Pins' },
  { code: 'BRG', name: 'Gold Brooch', ar: 'بروش ذهبي', basePrice: 65, category: 'Brooches & Pins' },
  { code: 'BRS', name: 'Silver Brooch', ar: 'بروش فضي', basePrice: 60, category: 'Brooches & Pins' },
  { code: 'BRF', name: 'Floral Brooch', ar: 'بروش زهري', basePrice: 48, category: 'Brooches & Pins' },
  { code: 'BRE', name: 'Enamel Brooch', ar: 'بروش مينا', basePrice: 42, category: 'Brooches & Pins' },
  { code: 'BLT', name: 'Fabric Belt', ar: 'حزام قماش', basePrice: 38, category: 'Belts & Sashes' },
  { code: 'BLT2', name: 'Leather Belt', ar: 'حزام جلد', basePrice: 55, category: 'Belts & Sashes' },
  { code: 'BLT3', name: 'Chain Belt', ar: 'حزام سلسلة', basePrice: 70, category: 'Belts & Sashes' },
  { code: 'BSH', name: 'Sash Wide', ar: 'وشاح عريض', basePrice: 45, category: 'Belts & Sashes' },
  { code: 'BSH2', name: 'Sash Organza', ar: 'وشاح أورجانزا', basePrice: 40, category: 'Belts & Sashes' },
  { code: 'FBK', name: 'Fabric Roll Black Crepe 1m', ar: 'قماش كريب أسود متر', basePrice: 42, category: 'Fabrics' },
  { code: 'FBN', name: 'Fabric Roll Nida 1m', ar: 'قماش نيدا متر', basePrice: 38, category: 'Fabrics' },
  { code: 'FBC', name: 'Fabric Roll Chiffon 1m', ar: 'قماش شيفون متر', basePrice: 35, category: 'Fabrics' },
  { code: 'FBS', name: 'Fabric Roll Satin 1m', ar: 'قماش ساتان متر', basePrice: 45, category: 'Fabrics' },
  { code: 'FBL', name: 'Fabric Roll Linen 1m', ar: 'قماش كتان متر', basePrice: 32, category: 'Fabrics' },
];

// UAE customer names (Emirati + expat)
const CUSTOMER_NAME_PAIRS = [
  // Emirati names
  { en: 'Mariam Al-Mansoori', ar: 'مريم المنصوري' },
  { en: 'Fatima Al-Mansoori', ar: 'فاطمة المنصوري' },
  { en: 'Aisha Al-Mansoori', ar: 'عائشة المنصوري' },
  { en: 'Noura Al-Mansoori', ar: 'نورة المنصوري' },
  { en: 'Hessa Al-Mansoori', ar: 'حصة المنصوري' },
  { en: 'Latifa Al-Mansoori', ar: 'لطيفة المنصوري' },
  { en: 'Mariam Al-Mazrouei', ar: 'مريم المزروعي' },
  { en: 'Fatima Al-Mazrouei', ar: 'فاطمة المزروعي' },
  { en: 'Noura Al-Mazrouei', ar: 'نورة المزروعي' },
  { en: 'Aisha Al-Mazrouei', ar: 'عائشة المزروعي' },
  { en: 'Mariam Al-Ketbi', ar: 'مريم الكتبي' },
  { en: 'Fatima Al-Ketbi', ar: 'فاطمة الكتبي' },
  { en: 'Noura Al-Ketbi', ar: 'نورة الكتبي' },
  { en: 'Hessa Al-Ketbi', ar: 'حصة الكتبي' },
  { en: 'Latifa Al-Ketbi', ar: 'لطيفة الكتبي' },
  { en: 'Mariam Al-Shamsi', ar: 'مريم الشامسي' },
  { en: 'Fatima Al-Shamsi', ar: 'فاطمة الشامسي' },
  { en: 'Aisha Al-Shamsi', ar: 'عائشة الشامسي' },
  { en: 'Noura Al-Shamsi', ar: 'نورة الشامسي' },
  { en: 'Hessa Al-Shamsi', ar: 'حصة الشامسي' },
  { en: 'Mariam Al-Falasi', ar: 'مريم الفلاسي' },
  { en: 'Fatima Al-Falasi', ar: 'فاطمة الفلاسي' },
  { en: 'Aisha Al-Falasi', ar: 'عائشة الفلاسي' },
  { en: 'Noura Al-Falasi', ar: 'نورة الفلاسي' },
  { en: 'Mariam Al-Muhairi', ar: 'مريم المهيري' },
  { en: 'Fatima Al-Muhairi', ar: 'فاطمة المهيري' },
  { en: 'Aisha Al-Muhairi', ar: 'عائشة المهيري' },
  { en: 'Hessa Al-Muhairi', ar: 'حصة المهيري' },
  { en: 'Mariam Al-Mulla', ar: 'مريم الملا' },
  { en: 'Fatima Al-Mulla', ar: 'فاطمة الملا' },
  { en: 'Noura Al-Qubaisi', ar: 'نورة القبيسي' },
  { en: 'Mariam Al-Qubaisi', ar: 'مريم القبيسي' },
  { en: 'Latifa Al-Qubaisi', ar: 'لطيفة القبيسي' },
  { en: 'Shaikha Al-Qubaisi', ar: 'شيخة القبيسي' },
  { en: 'Mariam Al-Zaabi', ar: 'مريم الزعابي' },
  { en: 'Fatima Al-Zaabi', ar: 'فاطمة الزعابي' },
  { en: 'Aisha Al-Zaabi', ar: 'عائشة الزعابي' },
  // Egyptian/Arab expats (with Arabic)
  { en: 'Nour Hassan', ar: 'نور حسن' },
  { en: 'Dina Ibrahim', ar: 'دينا إبراهيم' },
  { en: 'Rana Mahmoud', ar: 'رنا محمود' },
  { en: 'Sara Mohamed', ar: 'سارة محمد' },
  { en: 'Layla Ahmed', ar: 'ليلى أحمد' },
  { en: 'Hana Khalil', ar: 'هنا خليل' },
  // South Asian expats
  { en: 'Priya Nair', ar: '' },
  { en: 'Deepa Menon', ar: '' },
  { en: 'Anjali Thomas', ar: '' },
  { en: 'Sunita Sharma', ar: '' },
  { en: 'Divya Pillai', ar: '' },
  { en: 'Rekha Patel', ar: '' },
  { en: 'Kavitha Krishnan', ar: '' },
  // Filipino expats
  { en: 'Maria Santos', ar: '' },
  { en: 'Jennifer Cruz', ar: '' },
  { en: 'Rosario Dela Cruz', ar: '' },
  { en: 'Marilou Reyes', ar: '' },
  // Western expats
  { en: 'Emma Wilson', ar: '' },
  { en: 'Sarah Johnson', ar: '' },
];

// B2B company names (hotels, event planners, boutiques)
const B2B_COMPANIES = [
  { en: 'Al Fares Events LLC', ar: 'شركة الفارس للفعاليات' },
  { en: 'Dubai Elegance Trading', ar: 'دبي للتجارة الراقية' },
  { en: 'Sharjah Ladies Club', ar: 'نادي سيدات الشارقة' },
  { en: 'Jumeirah Collection Store', ar: 'متجر مجموعة جميرا' },
  { en: 'Gulf Fashion Export LLC', ar: 'شركة الخليج لتصدير الأزياء' },
  { en: 'Al Noor Bridal House', ar: 'دار النور للأعراس' },
  { en: 'Emirates Style Trading', ar: 'الإمارات للتجارة الأنيقة' },
  { en: 'Arabesque Fashion LLC', ar: 'شركة الأرابيسك للأزياء' },
  { en: 'Majestic Events Dubai', ar: 'مجستيك للفعاليات دبي' },
  { en: 'Pearl of Arabia Boutique', ar: 'بوتيك لؤلؤة العرب' },
  { en: 'Al Majaz Fashion Co.', ar: 'شركة المجاز للأزياء' },
  { en: 'Reem Island Couture', ar: 'كوتور جزيرة الريم' },
  { en: 'Desert Rose Events', ar: 'فعاليات وردة الصحراء' },
  { en: 'Khalidiyah Style House', ar: 'دار خالدية ستايل' },
  { en: 'Global Modest Fashion FZE', ar: 'أزياء محتشمة عالمية' },
  { en: 'Deira Ladies Fashion', ar: 'ديرة لأزياء السيدات' },
  { en: 'Sharjah Expo Fashion LLC', ar: 'شركة شارجة إكسبو للأزياء' },
  { en: 'Mirdif Ladies Boutique', ar: 'بوتيك مردف للسيدات' },
  { en: 'Al Qasimia Trading', ar: 'تجارة القاسمية' },
  { en: 'Bur Dubai Fashion House', ar: 'دار بر دبي للأزياء' },
  { en: 'Marina Walk Boutique', ar: 'بوتيك ووك مارينا' },
  { en: 'Emirates NBD Corporate Gifts', ar: 'هدايا مؤسسية الإمارات NBD' },
  { en: 'ADCB Ladies Events', ar: 'فعاليات سيدات ADCB' },
  { en: 'Dubai Frame Events LLC', ar: 'فعاليات إطار دبي' },
  { en: 'Hilton Events Division', ar: 'قسم فعاليات هيلتون' },
];

const SUPPLIER_DATA = [
  { en: 'Al-Hana Textiles LLC', ar: 'شركة الهناء للنسيج', country: 'UAE', hasTrn: true },
  { en: 'Emirates Fabric House', ar: 'دار الأقمشة الإماراتية', country: 'UAE', hasTrn: true },
  { en: 'Gul Ahmed Fabrics UAE', ar: 'جل أحمد للأقمشة الإمارات', country: 'UAE', hasTrn: true },
  { en: 'Dubai Fashion District FZE', ar: 'حي الموضة دبي', country: 'UAE', hasTrn: true },
  { en: 'Al Baraka Trading LLC', ar: 'شركة البركة التجارية', country: 'UAE', hasTrn: true },
  { en: 'Sharjah Textile Souk Wholesale', ar: 'سوق نسيج الشارقة للجملة', country: 'UAE', hasTrn: true },
  { en: 'Gulf Crepe & Nida Suppliers', ar: 'موردو الكريب والنيدا الخليجي', country: 'UAE', hasTrn: true },
  { en: 'Yıldız Textile Istanbul', ar: 'نسيج يلدز إسطنبول', country: 'Turkey', hasTrn: false },
  { en: 'Butik Kumaş Turkey', ar: 'بوتيك قماش تركيا', country: 'Turkey', hasTrn: false },
  { en: 'Surat Fabric Mills Pvt Ltd', ar: 'مصانع سورات للقماش', country: 'India', hasTrn: false },
  { en: 'Mumbai Embroidery Exports', ar: 'مصدرو التطريز مومباي', country: 'India', hasTrn: false },
  { en: 'Rajasthan Handicrafts Export', ar: 'حرف راجاستان التصديرية', country: 'India', hasTrn: false },
  { en: 'Jeddah Fashion Trading Co.', ar: 'شركة جدة للتجارة الأزياء', country: 'KSA', hasTrn: false },
  { en: 'Morocco Kaftan Import LLC', ar: 'استيراد قفاطين مغربية', country: 'Morocco', hasTrn: false },
  { en: 'Al-Siraj Accessories LLC', ar: 'شركة السراج للإكسسوارات', country: 'UAE', hasTrn: true },
];

// ============================================================================
// SEEDED RANDOM NUMBER GENERATOR
// ============================================================================

class SeededRandom {
  constructor(seed) {
    this.seed = seed;
  }

  next() {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  int(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  choice(arr) {
    return arr[this.int(0, arr.length - 1)];
  }

  shuffle(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
}

const rng = new SeededRandom(CONFIG.seed);

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatAED(value) {
  return (Math.round(value * 100) / 100).toFixed(2);
}

function escapeCSV(str) {
  if (typeof str !== 'string') return str == null ? '' : String(str);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function writeCSV(filename, rows, headers) {
  const bom = '﻿';
  const lines = [
    bom + headers.map(escapeCSV).join(','),
    ...rows.map(row => headers.map(h => escapeCSV(row[h] == null ? '' : String(row[h]))).join(',')),
  ];
  fs.writeFileSync(filename, lines.join('\n'), 'utf8');
  console.log(`  ✓ ${path.basename(filename)} (${rows.length} rows)`);
}

function generateBarcode() {
  let barcode = '';
  for (let i = 0; i < 12; i++) barcode += rng.int(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(barcode[i]) * (i % 2 === 0 ? 1 : 3);
  const check = (10 - (sum % 10)) % 10;
  return barcode + check;
}

function generateUAEPhone(style) {
  const firstDigit = rng.choice([2, 3, 4, 6, 7]);
  const remaining7 = Array.from({ length: 7 }, () => rng.int(0, 9)).join('');
  const nineDigitCore = `5${firstDigit}${remaining7}`;

  if (style === 0) {
    return `+971 ${nineDigitCore.substring(0, 2)} ${nineDigitCore.substring(2, 5)} ${nineDigitCore.substring(5)}`;
  } else if (style === 1) {
    return `0${nineDigitCore}`;
  } else {
    return `971-${nineDigitCore}`;
  }
}

function generateTRN(bad = false) {
  if (bad) {
    return Array.from({ length: 14 }, () => rng.int(0, 9)).join('');
  }
  return Array.from({ length: 15 }, () => rng.int(0, 9)).join('');
}

function formatUAEDate(offsetDays) {
  const d = new Date(2026, 5, 5);
  d.setDate(d.getDate() - offsetDays);
  return d.toISOString().split('T')[0];
}

// ============================================================================
// DATA GENERATORS
// ============================================================================

function generateCategories() {
  return CATEGORIES_BASE.map(cat => ({
    'Category Name': cat.name,
    'Parent Category': cat.parent || '',
    'Description': cat.ar ? cat.ar : `${cat.name} and related items`,
  }));
}

// Track generated SKUs and their costs for stock tie-out
const allProductSKUs = []; // { sku, cost }

function generateProducts() {
  const rows = [];
  const allSkus = new Set();
  const skuCollisions = [];

  const BAD_TAX_GROUP_SKUS = [];

  // ---- Abaya/Kaftan styles × colors × sizes ----
  // Each style gets 4-6 colors; all 6 sizes → ~120 styles × ~5 colors × 6 = ~3,600 rows

  for (const style of ABAYA_STYLES) {
    // Each style gets 4-6 colors deterministically
    const colorsForStyle = rng.int(4, 6);
    const shuffledColors = rng.shuffle(COLORS).slice(0, colorsForStyle);

    for (const color of shuffledColors) {
      for (const size of SIZES) {
        const skuBase = `ABY-${style.code}-${color.code}-${size}`;
        let sku = skuBase;

        // ~10 duplicate SKUs total across the whole product list
        if (skuCollisions.length < 10 && rng.int(1, 700) <= 2 && allSkus.size > 20) {
          const existingSkus = Array.from(allSkus);
          sku = existingSkus[rng.int(0, Math.min(30, existingSkus.length - 1))];
          skuCollisions.push(sku);
        }
        allSkus.add(sku);

        const price = style.basePrice + (SIZES.indexOf(size) * 5) + rng.int(-5, 5);
        const priceAED = Math.round(price / 5) * 5;
        const cost = priceAED * 0.55;

        // Tax group: exactly 10 rows get the bad "Standard Rate 5%" (no parens)
        let taxGroup = 'Standard Rate (5%)';
        if (BAD_TAX_GROUP_SKUS.length < 10 && rng.int(1, 60) <= 3) {
          taxGroup = 'Standard Rate 5%';
          BAD_TAX_GROUP_SKUS.push(sku);
        }

        if (style.fabric === 'Fabrics' || style.code === 'UND') {
          taxGroup = 'Zero Rate';
        }

        const hasNoCost = rng.int(1, 80) <= 2;
        const barcode = rng.int(1, 60) > 3 ? generateBarcode() : '';

        let sellingPrice = formatAED(priceAED);
        if (rng.int(1, 900) <= 5) {
          sellingPrice = `AED ${sellingPrice}`;
        }

        const arabicName = rng.int(0, 9) < 7
          ? `${style.ar} - ${color.ar} / ${size}`
          : '';

        rows.push({
          'Item Name': `${style.name} - ${color.name} / ${size}` + (rng.int(0, 100) < 3 ? '  ' : ''),
          'Arabic Name': arabicName,
          'SKU': sku,
          'Barcode': barcode,
          'Category': style.category,
          'Unit': 'Piece',
          'Purchase Rate': hasNoCost ? '' : formatAED(cost),
          'Selling Price': sellingPrice,
          'Reorder Level': rng.int(2, 10),
          'taxGroup': taxGroup,
          'Track Serial': 'No',
          'Status': 'Active',
        });

        allProductSKUs.push({ sku, cost: hasNoCost ? priceAED * 0.55 : cost });
      }
    }
  }

  // Ensure we have exactly 10 bad tax group rows — fill remaining if needed
  let filledBad = BAD_TAX_GROUP_SKUS.length;
  for (let i = 0; i < rows.length && filledBad < 10; i++) {
    if (rows[i].taxGroup === 'Standard Rate (5%)') {
      rows[i].taxGroup = 'Standard Rate 5%';
      BAD_TAX_GROUP_SKUS.push(rows[i].SKU);
      filledBad++;
    }
  }

  // ---- Accessories (~300+ rows, multiple colors) ----
  const accessoryColors = ['Black', 'Beige', 'White', 'Navy', 'Grey', 'Dusty Pink', 'Camel', 'Ivory'];
  const accessoryColorCodes = ['BLK', 'BGE', 'WHT', 'NVY', 'GRY', 'DPK', 'CAM', 'IVR'];
  let accIdx = 0;

  for (const acc of ACCESSORY_ITEMS) {
    const colorCount = rng.int(3, 8);
    for (let c = 0; c < colorCount; c++) {
      const colorName = accessoryColors[c % accessoryColors.length];
      const colorCode = accessoryColorCodes[c % accessoryColorCodes.length];
      const skuBase = `ACC-${acc.code}-${colorCode}`;
      const sku = skuBase + `-${accIdx}`;

      allSkus.add(sku);

      const price = acc.basePrice + rng.int(-3, 8);
      const cost = price * 0.5;
      const barcode = rng.int(1, 100) > 5 ? generateBarcode() : '';
      const hasNoCost = rng.int(1, 100) <= 5;
      let purchaseRate = hasNoCost ? '' : formatAED(cost);

      if (rng.int(1, 300) <= 5) {
        purchaseRate = `AED ${purchaseRate}`;
      }

      let taxGroup = 'Standard Rate (5%)';
      if (acc.category === 'Fabrics' || acc.category === 'Underscarves') {
        taxGroup = 'Zero Rate';
      }

      rows.push({
        'Item Name': `${acc.name} - ${colorName}` + (rng.int(0, 100) < 3 ? '  ' : ''),
        'Arabic Name': acc.ar || '',
        'SKU': sku,
        'Barcode': barcode,
        'Category': acc.category,
        'Unit': 'Piece',
        'Purchase Rate': purchaseRate,
        'Selling Price': formatAED(price),
        'Reorder Level': rng.int(5, 50),
        'taxGroup': taxGroup,
        'Track Serial': 'No',
        'Status': 'Active',
      });

      allProductSKUs.push({ sku, cost: hasNoCost ? price * 0.5 : cost });
      accIdx++;
    }
  }

  // 2 empty rows (mess)
  rows.splice(rng.int(50, 200), 0, {
    'Item Name': '', 'Arabic Name': '', 'SKU': '', 'Barcode': '', 'Category': '',
    'Unit': '', 'Purchase Rate': '', 'Selling Price': '', 'Reorder Level': '',
    'taxGroup': '', 'Track Serial': '', 'Status': '',
  });
  rows.splice(rng.int(300, rows.length - 50), 0, {
    'Item Name': '', 'Arabic Name': '', 'SKU': '', 'Barcode': '', 'Category': '',
    'Unit': '', 'Purchase Rate': '', 'Selling Price': '', 'Reorder Level': '',
    'taxGroup': '', 'Track Serial': '', 'Status': '',
  });

  console.log('\n  [INFO] 10 mismatched taxGroup SKUs (finding 2.3):');
  BAD_TAX_GROUP_SKUS.slice(0, 10).forEach((s, i) => console.log(`    ${i + 1}. ${s}`));
  globalThis.BAD_TAX_GROUP_SKUS = BAD_TAX_GROUP_SKUS.slice(0, 10);

  console.log(`\n  [INFO] ~${skuCollisions.length} duplicate SKUs injected`);
  globalThis.SKU_COLLISIONS = skuCollisions;

  return rows;
}

function generateCustomers() {
  const rows = [];
  const BAD_TRN_INDICES = [7, 19];
  const badTrnCustomers = [];

  for (let i = 0; i < CONFIG.customerCount; i++) {
    const isB2B = i < 25;
    let name, arabicName, trn;

    if (isB2B) {
      const company = B2B_COMPANIES[i % B2B_COMPANIES.length];
      name = company.en;
      arabicName = company.ar;
      const isBadTrn = BAD_TRN_INDICES.includes(i);
      trn = generateTRN(isBadTrn);
      if (isBadTrn) {
        badTrnCustomers.push({ index: i, name, trn });
      }
    } else {
      const namePair = rng.choice(CUSTOMER_NAME_PAIRS);
      name = namePair.en;
      arabicName = namePair.ar || '';
      trn = '';
    }

    const phone = generateUAEPhone(rng.int(0, 2));
    const email = rng.int(0, 9) < 4 ? `customer${i}@gmail.com` : '';

    let openingBalance = '0.00';
    if (rng.int(0, 1000) < 35) {
      const isNegative = rng.int(0, 100) < 15;
      const baseAmount = rng.int(200, 8000) + rng.choice([0, 0.25, 0.5, 0.75]);
      if (isNegative) {
        openingBalance = `(${formatAED(baseAmount)})`;
      } else {
        openingBalance = baseAmount.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      }
    }

    rows.push({
      'Ledger Name': name,
      'Name in Arabic': arabicName,
      'Mobile': phone,
      'Email': email,
      'TRN': trn,
      'Opening Balance (AED)': openingBalance,
      'Notes': isB2B ? 'B2B - Tax Invoice Required' : '',
    });
  }

  console.log('\n  [INFO] 2 bad-TRN customers (14-digit, finding 1.3):');
  badTrnCustomers.forEach(c => console.log(`    Row ${c.index + 2}: "${c.name}" TRN=${c.trn} (${c.trn.length} digits)`));
  globalThis.BAD_TRN_CUSTOMERS = badTrnCustomers;

  return rows;
}

function generateSuppliers() {
  const rows = [];
  const AP_BALANCE_INDICES = [0, 1, 2, 3, 5, 7, 9, 11];

  for (let i = 0; i < SUPPLIER_DATA.length; i++) {
    const s = SUPPLIER_DATA[i];
    const hasBalance = AP_BALANCE_INDICES.includes(i);
    const balance = hasBalance ? formatAED(rng.int(3000, 45000) + rng.choice([0, 0.25, 0.5])) : '0.00';
    const trn = s.hasTrn ? generateTRN(false) : '';

    rows.push({
      'Supplier Name': s.en,
      'Arabic Name': s.ar,
      'Country': s.country,
      'TRN': trn,
      'Phone': generateUAEPhone(0),
      'Email': `supplier${i}@trade.com`,
      'Payment Terms (Days)': rng.choice([0, 30, 45, 60]),
      'Opening Balance (AED)': balance,
    });
  }

  return rows;
}

/**
 * Generate opening stock with ONE row per (SKU, warehouse) by default.
 * Deliberate mess:
 *   - exactDupPairs: array of {sku} to duplicate (add a second row for same SKU+warehouse)
 *   - orphanCount: ~6 orphan SKUs (not in product list)
 *   - zeroQtyCount: ~4 rows with qty=0
 *
 * targetSkuCount: number of UNIQUE valid SKUs to include
 */
function generateOpeningStock(warehouse, targetSkuCount, exactDupPairs, orphanCount, zeroQtyCount) {
  const validSkus = allProductSKUs.filter(s => s && s.sku && s.sku.length > 0);

  // Pick unique SKUs for this warehouse
  const shuffled = rng.shuffle(validSkus);
  const selectedSkus = shuffled.slice(0, Math.min(targetSkuCount, validSkus.length));

  const rows = [];
  const zeroQtyIndices = new Set();

  // Choose which indices get zero qty
  while (zeroQtyIndices.size < zeroQtyCount && zeroQtyIndices.size < selectedSkus.length) {
    zeroQtyIndices.add(rng.int(0, selectedSkus.length - 1));
  }

  for (let i = 0; i < selectedSkus.length; i++) {
    const product = selectedSkus[i];
    const qty = zeroQtyIndices.has(i) ? 0 : rng.int(3, 80);
    const cost = product.cost > 0 ? formatAED(product.cost) : formatAED(rng.int(50, 200));

    rows.push({
      'SKU': product.sku,
      'Warehouse': warehouse,
      'Quantity': qty,
      'Unit Cost (AED)': cost,
    });
  }

  // Inject exactly 2 deliberate duplicate (SKU, warehouse) pairs
  const dupRows = [];
  for (const pair of exactDupPairs) {
    const original = rows.find(r => r.SKU === pair.sku);
    if (original) {
      dupRows.push({
        'SKU': pair.sku,
        'Warehouse': warehouse,
        'Quantity': rng.int(1, 20),
        'Unit Cost (AED)': original['Unit Cost (AED)'],
      });
    }
  }
  // Insert dup rows at random positions
  for (const dupRow of dupRows) {
    const insertAt = rng.int(0, rows.length);
    rows.splice(insertAt, 0, dupRow);
  }

  // Add orphan SKUs
  for (let i = 0; i < orphanCount; i++) {
    rows.push({
      'SKU': `ORPHAN-${rng.int(100000, 999999)}`,
      'Warehouse': warehouse,
      'Quantity': rng.int(1, 15),
      'Unit Cost (AED)': formatAED(rng.int(30, 200) + rng.choice([0, 0.25, 0.5])),
    });
  }

  return rows;
}

function generateCustomOrders() {
  const rows = [];
  const styles = ['Classic Crepe Abaya', 'Embroidered Gold Kaftan', 'Butterfly Chiffon Abaya',
    'Jalabiya Traditional', 'Occasion Kaftan Velvet', 'Custom Nida Abaya'];
  const measurements = [
    'Height 165cm, Sleeve 60cm, Chest 98cm',
    'Height 158cm, Sleeve 58cm, Chest 104cm',
    'Height 170cm, Sleeve 62cm, Chest 96cm',
    'Height 162cm, Sleeve 59cm, Chest 102cm',
    'Height 155cm, Sleeve 57cm, Chest 108cm',
  ];
  const statuses = ['Tailoring', 'Ready for Pickup', 'Delivered', 'Deposit Received', 'In Progress'];

  for (let i = 0; i < CONFIG.customOrderCount; i++) {
    const namePair = rng.choice(CUSTOMER_NAME_PAIRS.slice(0, 40));
    const totalAmount = rng.int(400, 2500);
    const depositPct = rng.choice([0.3, 0.4, 0.5]);
    const deposit = Math.round(totalAmount * depositPct);
    const balance = totalAmount - deposit;
    const orderDate = formatUAEDate(rng.int(10, 120));
    const deliveryDate = formatUAEDate(rng.int(0, 30));

    rows.push({
      'Order No': `MTO-2026-${String(i + 1).padStart(3, '0')}`,
      'Customer Name': namePair.en,
      'Customer Arabic': namePair.ar || '',
      'Style Description': rng.choice(styles),
      'Measurements Note': rng.choice(measurements),
      'Fabric/Color': rng.choice(['Black Crepe', 'Navy Nida', 'Beige Chiffon', 'Burgundy Satin', 'Dark Green Crepe']),
      'Total Amount (AED)': formatAED(totalAmount),
      'Deposit Paid (AED)': formatAED(deposit),
      'Balance Due (AED)': formatAED(balance),
      'Order Date': orderDate,
      'Delivery Date': deliveryDate,
      'Status': rng.choice(statuses),
      'Notes': rng.int(0, 5) === 0 ? 'Urgent - event' : '',
    });
  }

  return rows;
}

function generateTrialBalance(customerRows, supplierRows, dubaiStockValue, sharjahStockValue) {
  let arSum = 0;
  for (const row of customerRows) {
    const balance = row['Opening Balance (AED)'];
    if (balance && !balance.includes('(') && balance !== '0.00') {
      arSum += parseFloat(balance.replace(/,/g, ''));
    }
  }

  let apSum = 0;
  for (const row of supplierRows) {
    const balance = row['Opening Balance (AED)'];
    if (balance && balance !== '0.00') {
      apSum += parseFloat(balance.replace(/,/g, ''));
    }
  }

  const accounts = [
    { name: 'Cash in Hand', debit: 28450.00, credit: 0 },
    { name: 'Bank - Emirates NBD Current Account', debit: 215340.75, credit: 0 },
    { name: 'Bank - ADIB Islamic Account', debit: 94780.50, credit: 0 },
    { name: 'Accounts Receivable (Trade Debtors)', debit: arSum, credit: 0 },
    { name: 'Inventory - Dubai Jumeirah Store', debit: dubaiStockValue, credit: 0 },
    { name: 'Inventory - Sharjah Al Majaz Store', debit: sharjahStockValue, credit: 0 },
    { name: 'Furniture & Fixtures', debit: 38200.00, credit: 0 },
    { name: 'Prepaid Rent (إيجار مدفوع مقدما)', debit: 12500.00, credit: 0 },
    { name: 'Accounts Payable (Trade Creditors)', debit: 0, credit: apSum },
    { name: 'VAT Payable', debit: 0, credit: 12345.67 },
    { name: 'Loan - Business Finance', debit: 0, credit: 85000.00 },
    { name: 'Owner Capital', debit: 0, credit: 0 }, // plug
  ];

  let totalDebits = 0;
  let totalCredits = 0;
  for (let i = 0; i < accounts.length; i++) {
    if (i === 11) continue;
    totalDebits += accounts[i].debit;
    totalCredits += accounts[i].credit;
  }

  const difference = totalDebits - totalCredits;
  if (difference >= 0) {
    accounts[11].credit = Math.round(difference * 100) / 100;
  } else {
    accounts[11].debit = Math.round(Math.abs(difference) * 100) / 100;
  }

  return accounts;
}

// ============================================================================
// MAIN GENERATION
// ============================================================================

console.log('🚀 Generating Mariam Abaya Boutique (UAE) test data...\n');

const outDir = '/Users/hus3ain/Development/Zerupt/agent-os/product/user-journeys/test-data/mariam';

// Categories
const categories = generateCategories();
console.log('Generated categories:', categories.length);

// Products (also populates allProductSKUs)
console.log('\nGenerating products...');
const products = generateProducts();

// Count unique SKUs in products (excluding empty rows)
const productUniqueSkus = new Set(products.map(p => p.SKU).filter(s => s && s.length > 0));
console.log(`\n  Total product rows: ${products.length}`);
console.log(`  Unique SKUs: ${productUniqueSkus.size}`);

// Customers & Suppliers
console.log('\nGenerating customers & suppliers...');
const customers = generateCustomers();
const suppliers = generateSuppliers();
console.log(`\n  Customers: ${customers.length}`);
console.log(`  Suppliers: ${suppliers.length}`);

// Opening Stock — ONE row per (SKU, warehouse) + deliberate mess
// Determine dup pairs deterministically from first few valid SKUs
const validSkuList = allProductSKUs.filter(s => s && s.sku && s.sku.length > 0);

// Deliberate dup pairs: pick 2 SKUs at fixed positions
const DUP_PAIRS_DUBAI = [
  { sku: validSkuList[5].sku },
  { sku: validSkuList[15].sku },
];
const DUP_PAIRS_SHARJAH = [
  { sku: validSkuList[8].sku },
  { sku: validSkuList[22].sku },
];

// Target unique SKU counts: Dubai ~2,400, Sharjah ~1,600
const DUBAI_UNIQUE_TARGET = 2400;
const SHARJAH_UNIQUE_TARGET = 1600;

console.log('\nGenerating opening stock...');
const dubaiStock = generateOpeningStock(
  'Dubai - Jumeirah',
  DUBAI_UNIQUE_TARGET,
  DUP_PAIRS_DUBAI,
  6,  // orphan count
  4,  // zero qty count
);
const sharjahStock = generateOpeningStock(
  'Sharjah - Al Majaz',
  SHARJAH_UNIQUE_TARGET,
  DUP_PAIRS_SHARJAH,
  6,  // orphan count
  4,  // zero qty count
);

// Count unique SKUs in stock files (excluding orphans)
const dubaiUniqueSkus = new Set(dubaiStock.map(r => r.SKU).filter(s => !s.startsWith('ORPHAN-')));
const sharjahUniqueSkus = new Set(sharjahStock.map(r => r.SKU).filter(s => !s.startsWith('ORPHAN-')));

console.log(`  Dubai: ${dubaiStock.length} rows (${dubaiUniqueSkus.size} unique valid SKUs + 6 orphans + 2 dup rows + 4 zero-qty)`);
console.log(`  Sharjah: ${sharjahStock.length} rows (${sharjahUniqueSkus.size} unique valid SKUs + 6 orphans + 2 dup rows + 4 zero-qty)`);

// Report deliberate dup pairs
console.log('\n  [INFO] Deliberate duplicate (SKU, warehouse) pairs:');
console.log(`    Dubai:   ${DUP_PAIRS_DUBAI[0].sku}, ${DUP_PAIRS_DUBAI[1].sku}`);
console.log(`    Sharjah: ${DUP_PAIRS_SHARJAH[0].sku}, ${DUP_PAIRS_SHARJAH[1].sku}`);
globalThis.DUP_PAIRS = { dubai: DUP_PAIRS_DUBAI, sharjah: DUP_PAIRS_SHARJAH };

// Custom Orders
const customOrders = generateCustomOrders();
console.log(`  Custom orders: ${customOrders.length}`);

// Inventory values — use ONLY non-duplicate rows for tie-out
// (sum the first occurrence of each (SKU, warehouse) to match import behavior)
const calcInventoryValue = (stock) => {
  const seen = new Set();
  let total = 0;
  for (const row of stock) {
    if (row.SKU.startsWith('ORPHAN-')) continue; // orphans excluded from inventory value
    const key = `${row.SKU}|${row.Warehouse}`;
    if (seen.has(key)) continue; // use first occurrence (import behavior)
    seen.add(key);
    const qty = parseInt(row.Quantity) || 0;
    const cost = parseFloat(row['Unit Cost (AED)']) || 0;
    total += qty * cost;
  }
  return total;
};

const dubaiValue = calcInventoryValue(dubaiStock);
const sharjahValue = calcInventoryValue(sharjahStock);
console.log(`\nInventory values (first-occurrence dedup, excluding orphans):`);
console.log(`  Dubai:   AED ${formatAED(dubaiValue)}`);
console.log(`  Sharjah: AED ${formatAED(sharjahValue)}`);
console.log(`  Total:   AED ${formatAED(dubaiValue + sharjahValue)}`);

// Trial Balance — uses exact per-warehouse values
const trialBalance = generateTrialBalance(customers, suppliers, dubaiValue, sharjahValue);

// ============================================================================
// WRITE FILES
// ============================================================================

console.log(`\nWriting CSVs to ${outDir}:\n`);

writeCSV(
  path.join(outDir, '01-categories.csv'),
  categories,
  ['Category Name', 'Parent Category', 'Description']
);

writeCSV(
  path.join(outDir, '02-products.csv'),
  products,
  ['Item Name', 'Arabic Name', 'SKU', 'Barcode', 'Category', 'Unit', 'Purchase Rate', 'Selling Price', 'Reorder Level', 'taxGroup', 'Track Serial', 'Status']
);

writeCSV(
  path.join(outDir, '03-customers.csv'),
  customers,
  ['Ledger Name', 'Name in Arabic', 'Mobile', 'Email', 'TRN', 'Opening Balance (AED)', 'Notes']
);

writeCSV(
  path.join(outDir, '04-suppliers.csv'),
  suppliers,
  ['Supplier Name', 'Arabic Name', 'Country', 'TRN', 'Phone', 'Email', 'Payment Terms (Days)', 'Opening Balance (AED)']
);

writeCSV(
  path.join(outDir, '05-opening-stock-dubai.csv'),
  dubaiStock,
  ['SKU', 'Warehouse', 'Quantity', 'Unit Cost (AED)']
);

writeCSV(
  path.join(outDir, '06-opening-stock-sharjah.csv'),
  sharjahStock,
  ['SKU', 'Warehouse', 'Quantity', 'Unit Cost (AED)']
);

writeCSV(
  path.join(outDir, '07-custom-orders.csv'),
  customOrders,
  ['Order No', 'Customer Name', 'Customer Arabic', 'Style Description', 'Measurements Note', 'Fabric/Color', 'Total Amount (AED)', 'Deposit Paid (AED)', 'Balance Due (AED)', 'Order Date', 'Delivery Date', 'Status', 'Notes']
);

// Trial Balance
const tbRows = trialBalance.map(acc => {
  const debitStr = acc.debit > 0
    ? acc.debit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';
  const creditStr = acc.credit > 0
    ? acc.credit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';
  return {
    'Account Name': acc.name,
    'Debit (AED)': debitStr,
    'Credit (AED)': creditStr,
  };
});

writeCSV(
  path.join(outDir, '08-trial-balance.csv'),
  tbRows,
  ['Account Name', 'Debit (AED)', 'Credit (AED)']
);

// Windows-1256 encoded (first 50 customers)
const customersWin1256 = customers.slice(0, 50);
const headerLine = 'Ledger Name,Name in Arabic,Mobile,Email,TRN,Opening Balance (AED),Notes';
let csvLines = [headerLine];
for (const row of customersWin1256) {
  const line = [
    escapeCSV(row['Ledger Name']),
    escapeCSV(row['Name in Arabic']),
    escapeCSV(row.Mobile),
    escapeCSV(row.Email),
    escapeCSV(row.TRN),
    escapeCSV(row['Opening Balance (AED)']),
    escapeCSV(row.Notes),
  ].join(',');
  csvLines.push(line);
}
const csvContent = csvLines.join('\n') + '\n';
const win1256Path = path.join(outDir, '09-customers-windows1256.csv');
const tmpUtf8Path = `${win1256Path}.utf8.tmp`;
fs.writeFileSync(tmpUtf8Path, csvContent, 'utf8');
execSync(
  `iconv -f UTF-8 -t WINDOWS-1256//TRANSLIT ${JSON.stringify(tmpUtf8Path)} > ${JSON.stringify(win1256Path)}`,
);
fs.unlinkSync(tmpUtf8Path);
console.log(`  ✓ 09-customers-windows1256.csv (${customersWin1256.length} rows)`);

// ============================================================================
// VALIDATION & REPORTING
// ============================================================================

console.log('\n📊 VALIDATION\n');

// Trial balance check
let tbDebits = 0;
let tbCredits = 0;
for (const acc of trialBalance) {
  tbDebits += acc.debit;
  tbCredits += acc.credit;
}
tbDebits = Math.round(tbDebits * 100) / 100;
tbCredits = Math.round(tbCredits * 100) / 100;

console.log('Trial Balance:');
console.log(`  Total Debits:  AED ${formatAED(tbDebits)}`);
console.log(`  Total Credits: AED ${formatAED(tbCredits)}`);
console.log(`  Balanced:      ${Math.abs(tbDebits - tbCredits) < 0.01 ? '✓ YES' : '✗ NO (diff=' + (tbDebits - tbCredits).toFixed(2) + ')'}\n`);

// AR tie-out
let customerAR = 0;
for (const cust of customers) {
  const bal = cust['Opening Balance (AED)'];
  if (bal && !bal.includes('(') && bal !== '0.00') {
    customerAR += parseFloat(bal.replace(/,/g, ''));
  }
}
customerAR = Math.round(customerAR * 100) / 100;
const tbAR = Math.round(trialBalance.find(a => a.name.includes('Receivable')).debit * 100) / 100;

console.log('AR Tie-Out:');
console.log(`  Customer AR sum: AED ${formatAED(customerAR)}`);
console.log(`  TB AR line:      AED ${formatAED(tbAR)}`);
console.log(`  Match: ${Math.abs(customerAR - tbAR) < 0.01 ? '✓ YES' : '✗ NO'}\n`);

// AP tie-out
let supplierAP = 0;
for (const s of suppliers) {
  const bal = s['Opening Balance (AED)'];
  if (bal && bal !== '0.00') supplierAP += parseFloat(bal.replace(/,/g, ''));
}
supplierAP = Math.round(supplierAP * 100) / 100;
const tbAP = Math.round(trialBalance.find(a => a.name.includes('Payable') && a.name.includes('Trade')).credit * 100) / 100;

console.log('AP Tie-Out:');
console.log(`  Supplier AP sum: AED ${formatAED(supplierAP)}`);
console.log(`  TB AP line:      AED ${formatAED(tbAP)}`);
console.log(`  Match: ${Math.abs(supplierAP - tbAP) < 0.01 ? '✓ YES' : '✗ NO'}\n`);

// Stock value tie-out
const tbDubai = trialBalance.find(a => a.name.includes('Dubai'));
const tbSharjah = trialBalance.find(a => a.name.includes('Sharjah'));
console.log('Stock Value Tie-Out:');
console.log(`  Dubai stock computed:  AED ${formatAED(dubaiValue)}`);
console.log(`  TB Dubai line:         AED ${formatAED(tbDubai.debit)}`);
console.log(`  Dubai Match:           ${Math.abs(dubaiValue - tbDubai.debit) < 0.01 ? '✓ YES' : '✗ NO'}`);
console.log(`  Sharjah stock computed: AED ${formatAED(sharjahValue)}`);
console.log(`  TB Sharjah line:        AED ${formatAED(tbSharjah.debit)}`);
console.log(`  Sharjah Match:          ${Math.abs(sharjahValue - tbSharjah.debit) < 0.01 ? '✓ YES' : '✗ NO'}\n`);

// VAT payable check
const vatPayable = trialBalance.find(a => a.name === 'VAT Payable');
console.log(`VAT Payable: AED ${formatAED(vatPayable.credit)} (should be 12,345.67 per journey doc L5)`);
console.log(`  ✓ ${Math.abs(vatPayable.credit - 12345.67) < 0.01 ? 'CORRECT' : 'WRONG'}\n`);

// Summary
console.log('📋 INTENTIONAL MESS SUMMARY:\n');
console.log('  02-products.csv:');
console.log(`    • ~${(globalThis.SKU_COLLISIONS || []).length} duplicate SKUs`);
console.log('    • ~15 empty Purchase Rate rows');
console.log('    • ~5 "AED " prefixed price cells');
console.log('    • 2 fully empty rows');
console.log('    • ~5 item names with trailing whitespace');
console.log('    • EXACTLY 10 rows with taxGroup="Standard Rate 5%" (no parens, Zoho-style)');
console.log('    • Some Zero Rate items (Fabrics, Underscarves)\n');
console.log('  03-customers.csv:');
console.log('    • 25 B2B customers with TRN (15 digits)');
console.log('    • EXACTLY 2 customers with 14-digit (wrong-length) TRN');
console.log('    • Inconsistent phone formats (+971, 05x, 971-)');
console.log('    • ~20 customers with AR opening balances\n');
console.log('  04-suppliers.csv:');
console.log('    • UAE suppliers have TRN; overseas (Turkey, India) do not');
console.log('    • ~8 with AP opening balances\n');
console.log('  05/06-opening-stock-*.csv:');
console.log('    • ONE row per (SKU, warehouse) — except 2 deliberate dup pairs per file');
console.log('    • 6 orphan SKUs per file');
console.log('    • 4 zero-quantity rows per file\n');
console.log('  07-custom-orders.csv:');
console.log('    • 40 made-to-order records');
console.log('    • NOTE: NO import destination in current system (finding 6.3)\n');

console.log('\n✅ Generation complete!\n');
