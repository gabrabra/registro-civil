const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { PERFIS_PADRAO, MODULOS_COM_REGISTRO } = require('./utils/permissoes');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Record tables a user's creation quota is counted across
const TABELAS_DE_REGISTRO = {
  nascimento: 'registros_nascimento',
  testamento: 'registros_testamento',
  escritura:  'registros_escritura',
};

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS perfis (
      id          SERIAL PRIMARY KEY,
      nome        VARCHAR(100) NOT NULL UNIQUE,
      descricao   TEXT,
      is_admin    BOOLEAN NOT NULL DEFAULT FALSE,
      permissoes  JSONB NOT NULL DEFAULT '{}'::jsonb,
      criado_em   TIMESTAMP DEFAULT NOW(),
      atualizado_em TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id         SERIAL PRIMARY KEY,
      nome       VARCHAR(200) NOT NULL,
      email      VARCHAR(200) NOT NULL UNIQUE,
      senha_hash VARCHAR(200) NOT NULL,
      criado_em  TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS livros (
      id           SERIAL PRIMARY KEY,
      numero       VARCHAR(50)  NOT NULL,
      cartorio     VARCHAR(500),
      cnpj         VARCHAR(25),
      cns          VARCHAR(20),
      termo_inicio INTEGER,
      termo_fim    INTEGER,
      data_inicio  DATE,
      data_fim     DATE,
      municipio    VARCHAR(200),
      estado       VARCHAR(5),
      descricao    TEXT,
      criado_em    TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS registros_nascimento (
      id              SERIAL PRIMARY KEY,
      livro_id        INTEGER REFERENCES livros(id) ON DELETE SET NULL,
      nome_completo   VARCHAR(500),
      nome_mae        VARCHAR(500),
      nome_pai        VARCHAR(500),
      data_nascimento VARCHAR(200),
      ano             INTEGER,
      livro           VARCHAR(100),
      folha           VARCHAR(100),
      numero_termo    VARCHAR(200),
      municipio       VARCHAR(500),
      estado          VARCHAR(20),
      confianca       VARCHAR(20),
      observacoes     TEXT,
      transcricao_completa TEXT,
      arquivo_path    VARCHAR(1000),
      arquivo_nome    VARCHAR(500),
      arquivo_tipo    VARCHAR(100),
      criado_em       TIMESTAMP DEFAULT NOW(),
      atualizado_em   TIMESTAMP DEFAULT NOW()
    )
  `);

  // Migrations
  await pool.query(
    `ALTER TABLE registros_nascimento ADD COLUMN IF NOT EXISTS livro_id INTEGER REFERENCES livros(id) ON DELETE SET NULL`
  ).catch(() => {});
  await pool.query(`ALTER TABLE livros ADD COLUMN IF NOT EXISTS arquivo_capa_path VARCHAR(1000)`).catch(() => {});
  await pool.query(`ALTER TABLE livros ADD COLUMN IF NOT EXISTS arquivo_capa_nome VARCHAR(500)`).catch(() => {});
  await pool.query(`ALTER TABLE livros ADD COLUMN IF NOT EXISTS arquivo_capa_url  VARCHAR(500)`).catch(() => {});
  await pool.query(`ALTER TABLE registros_nascimento ADD COLUMN IF NOT EXISTS campos_bbox JSONB`).catch(() => {});
  await pool.query(`ALTER TABLE registros_nascimento ADD COLUMN IF NOT EXISTS arquivo_url VARCHAR(500)`).catch(() => {});
  await pool.query(`ALTER TABLE registros_escritura  ADD COLUMN IF NOT EXISTS arquivos_urls JSONB`).catch(() => {});
  await pool.query(`ALTER TABLE registros_testamento ADD COLUMN IF NOT EXISTS arquivos_urls JSONB`).catch(() => {});

  await pool.query(`
    CREATE TABLE IF NOT EXISTS registros_testamento (
      id              SERIAL PRIMARY KEY,
      livro_id        INTEGER REFERENCES livros(id) ON DELETE SET NULL,
      testador        VARCHAR(500),
      data_testamento VARCHAR(200),
      ano             INTEGER,
      livro           TEXT,
      folha           TEXT,
      tabeliao        VARCHAR(500),
      testemunhas     TEXT,
      municipio       VARCHAR(500),
      estado          VARCHAR(20),
      confianca       VARCHAR(20),
      observacoes     TEXT,
      transcricao_completa TEXT,
      arquivo_path    VARCHAR(1000),
      arquivo_nome    VARCHAR(500),
      arquivo_tipo    VARCHAR(100),
      arquivo_url     VARCHAR(500),
      campos_bbox     JSONB,
      criado_em       TIMESTAMP DEFAULT NOW(),
      atualizado_em   TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS registros_escritura (
      id               SERIAL PRIMARY KEY,
      livro_id         INTEGER REFERENCES livros(id) ON DELETE SET NULL,
      vendedor         VARCHAR(500),
      cpf_vendedor     TEXT,
      comprador        VARCHAR(500),
      cpf_comprador    TEXT,
      data_escritura   VARCHAR(200),
      ano              INTEGER,
      livro            TEXT,
      folha            TEXT,
      descricao_imovel TEXT,
      endereco_imovel  VARCHAR(1000),
      valor            TEXT,
      tabeliao         VARCHAR(500),
      cartorio         VARCHAR(500),
      municipio        VARCHAR(500),
      estado           VARCHAR(20),
      confianca        VARCHAR(20),
      observacoes      TEXT,
      transcricao_completa TEXT,
      arquivo_path     VARCHAR(1000),
      arquivo_nome     VARCHAR(500),
      arquivo_tipo     VARCHAR(100),
      arquivo_url      VARCHAR(500),
      campos_bbox      JSONB,
      criado_em        TIMESTAMP DEFAULT NOW(),
      atualizado_em    TIMESTAMP DEFAULT NOW()
    )
  `);

  // Full-page transcription — runs after the CREATE TABLEs above so it also
  // covers databases created before the column existed
  for (const t of ['registros_nascimento', 'registros_testamento', 'registros_escritura']) {
    await pool.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS transcricao_completa TEXT`).catch(() => {});
  }

  // Trigram index makes ILIKE '%termo%' over the transcription usable as the table grows
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`).catch(() => {});
  for (const t of ['registros_nascimento', 'registros_testamento', 'registros_escritura']) {
    await pool.query(
      `CREATE INDEX IF NOT EXISTS ${t}_transcricao_trgm ON ${t} USING gin (transcricao_completa gin_trgm_ops)`
    ).catch(() => {});
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS configuracoes (
      chave        VARCHAR(100) PRIMARY KEY,
      valor        TEXT,
      atualizado_em TIMESTAMP DEFAULT NOW()
    )
  `);

  // --- Users, profiles and quota ---
  await pool.query(
    `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS perfil_id INTEGER REFERENCES perfis(id) ON DELETE SET NULL`
  ).catch(() => {});
  // NULL = unlimited
  await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS limite_registros INTEGER`).catch(() => {});
  await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE`).catch(() => {});
  await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP DEFAULT NOW()`).catch(() => {});

  // Authorship — the quota counts rows created by each user
  for (const tabela of Object.values(TABELAS_DE_REGISTRO)) {
    await pool.query(
      `ALTER TABLE ${tabela} ADD COLUMN IF NOT EXISTS criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL`
    ).catch(() => {});
    await pool.query(
      `CREATE INDEX IF NOT EXISTS ${tabela}_criado_por_idx ON ${tabela} (criado_por)`
    ).catch(() => {});
  }

  // Seed the default profiles. Only inserted when missing — an operator who
  // edits "Cartório" must not have it reset on every restart.
  for (const perfil of PERFIS_PADRAO) {
    await pool.query(
      `INSERT INTO perfis (nome, descricao, is_admin, permissoes)
       VALUES ($1, $2, $3, $4) ON CONFLICT (nome) DO NOTHING`,
      [perfil.nome, perfil.descricao, perfil.is_admin, JSON.stringify(perfil.permissoes)]
    );
  }

  // Seed admin user
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@registrocivil.com';
  const adminPass  = process.env.ADMIN_PASSWORD || 'Admin@2024';
  const hash = await bcrypt.hash(adminPass, 10);
  await pool.query(
    `INSERT INTO usuarios (nome, email, senha_hash) VALUES ('Administrador', $1, $2) ON CONFLICT (email) DO NOTHING`,
    [adminEmail, hash]
  );

  // Any user without a profile gets Administrator — this covers the upgrade
  // from before profiles existed, where locking everyone out would be worse.
  await pool.query(
    `UPDATE usuarios SET perfil_id = (SELECT id FROM perfis WHERE nome = 'Administrador')
      WHERE perfil_id IS NULL`
  ).catch(() => {});
}

module.exports = { pool, initDb, TABELAS_DE_REGISTRO };
