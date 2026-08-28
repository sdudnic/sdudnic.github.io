/*
 * Configurația publică a catalogului.
 *
 * Supabase URL-ul și cheia anonă pot fi publicate în aplicația web. Secretul
 * OAuth Google/GitHub rămâne în tabloul de bord Supabase și nu se pune niciodată aici.
 * Lasă valorile goale pentru modul local: catalogul static și filtrele rămân
 * active, iar autentificarea se activează după completarea lor.
 */
window.MOLDOVENEASCA_CONFIG = Object.freeze({
  supabaseUrl: "https://ptggghmvctqidhaplyev.supabase.co",
  supabaseAnonKey: "sb_publishable_pgpRZzWpdacaa1OTgLo2bQ_YFYqjx9i",
  mcpApiUrl: "https://moldoveneasca-mcp.dudnic-moldoveneasca-mcp.workers.dev",
  redirectTo: "https://dudnic.com/moldoveneasca/"
});
