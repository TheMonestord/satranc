// Varlık hattının ayarları: hangi kaynak dosyadan hangi çıktı üretilir.
// Hem Node betiği (hazirla.mjs) hem tarayıcıdaki dönüştürme sayfaları bu dosyayı okur.
//
// Kaynak dosya adları "düzleştirilmiş" biçimde yazılır: harf, rakam ve nokta dışındaki her
// karakter "_" olur. Örnek: "Sitting Idle (1).fbx" -> "Sitting_Idle__1_.fbx". Böylece Mixamo'dan
// indirilen dosyalar yeniden adlandırılmadan kullanılabilir.

/** Rakip karakterler: Mixamo'dan "with skin" (T-poz) indirilen FBX dosyaları. */
export const KARAKTERLER = [
  { id: 'ty', kaynak: 'Ty.fbx' },
  { id: 'patron', kaynak: 'The_Boss.fbx' },
  { id: 'sovalye', kaynak: 'castle_guard_01.fbx' },
];

/**
 * Canlandırmalar: Mixamo'dan "without skin" indirilen FBX dosyaları.
 * tur:
 *  - 'oturma'   : oturarak oynanan klip; kalça konumu ortak oturma noktasına taşınır.
 *  - 'gecis'    : oturmaya geçiş (ayaktan oturur); son karesi oturma noktasına oturur.
 *  - 'ust-govde': ayakta çekilmiş klip; yalnızca gövde üstü (omurga, boyun, baş, kollar) izleri kalır.
 * 'oturus' klibi tek karelik oturma pozudur ve ortak oturma yüksekliğini belirler.
 */
export const KLIPLER = [
  { ad: 'bekleme-1', kaynak: 'Sitting_Idle.fbx', tur: 'oturma' },
  { ad: 'bekleme-2', kaynak: 'Seated_Idle.fbx', tur: 'oturma' },
  { ad: 'bekleme-3', kaynak: 'Sitting_Idle__1_.fbx', tur: 'oturma' },
  { ad: 'oturus', kaynak: 'Male_Sitting_Pose.fbx', tur: 'oturma' },
  { ad: 'dusunme-1', kaynak: 'Sitting__3_.fbx', tur: 'oturma' },
  { ad: 'dusunme-2', kaynak: 'Sitting__1_.fbx', tur: 'oturma' },
  { ad: 'oturma-1', kaynak: 'Sitting.fbx', tur: 'oturma' },
  { ad: 'oturma-2', kaynak: 'Sitting__2_.fbx', tur: 'gecis' },
  { ad: 'alkis-1', kaynak: 'Sitting_Clap.fbx', tur: 'oturma' },
  { ad: 'alkis-2', kaynak: 'Sitting_Clap__1_.fbx', tur: 'oturma' },
  { ad: 'begeni', kaynak: 'Sitting_Thumbs_Up.fbx', tur: 'oturma' },
  { ad: 'sevinc', kaynak: 'Cheering_While_Sitting.fbx', tur: 'oturma' },
  { ad: 'onaylamama', kaynak: 'Sitting_Disapproval.fbx', tur: 'oturma' },
  { ad: 'kizgin', kaynak: 'Angry_Gesture.fbx', tur: 'oturma' },
  { ad: 'yumruk', kaynak: 'Banging_Fist.fbx', tur: 'oturma' },
  { ad: 'konusma', kaynak: 'Sitting_Talking.fbx', tur: 'oturma' },
  { ad: 'sasirma', kaynak: 'Surprised.fbx', tur: 'ust-govde' },
];

/** Oturma yüksekliğini belirleyen klip. */
export const OTURUS_KLIBI = 'oturus';

export const AYAR = {
  /** Çıktıda 1 birim = 1 metre olsun diye kök düğüme verilen ölçek (kaynak santimetre). */
  olcek: 0.01,
  /** Canlandırma kare hızı üst sınırı. */
  fps: 30,
  /** Ana kare seyreltme toleransları (kayıpsıza yakın). */
  donusTolerans: 0.0015, // radyan (~0,09°)
  konumTolerans: 0.02, // kaynak birimi (cm)
  /** Ayak tabanının y=0'a oturtulduğu klip (ana bekleme). */
  zeminKlibi: 'bekleme-1',
  /** Doku boyutu üst sınırı; yüz/baş dokusu için daha büyük sınır. */
  dokuSiniri: 1024,
  yuzDokuSiniri: 2048,
  yuzAdi: /head|face|kafa|yuz/i,
  /** Karakter dosyası boyut sınırı (bayt). */
  karakterSiniri: 8 * 1024 * 1024,
};

/** Taş seti: kaynak GLB ve çıktı teması. */
export const TASLAR = {
  kaynak: 'cartoon_chess_set.glb',
  tema: 'cizgi-film',
  /** Kaynaktaki taş grubu adı -> oyundaki ad. Kaynakta her iki renk de "_W" ile adlandırılmış. */
  turler: {
    Pawn_W1: 'piyon',
    Rook_W1: 'kale',
    Knight_W1: 'at',
    Bishop_W1: 'fil',
    Queen_W: 'vezir',
    King_W: 'sah',
  },
  beyaz: '#efe3c8',
  siyah: '#3a2418',
  detay: '#1c120c',
  puruzluluk: 0.45,
  /** Bu sayıyı aşan taşlar inceltilir (üçgen). */
  ucgenSiniri: 3000,
};

/** Kaynak dosya adını düzleştirir: "The Boss.fbx" -> "The_Boss.fbx". */
export function duzAd(ad) {
  return ad.replace(/[^A-Za-z0-9.]/g, '_');
}
