const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function initDb() {
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
      arquivo_path     VARCHAR(1000),
      arquivo_nome     VARCHAR(500),
      arquivo_tipo     VARCHAR(100),
      arquivo_url      VARCHAR(500),
      campos_bbox      JSONB,
      criado_em        TIMESTAMP DEFAULT NOW(),
      atualizado_em    TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS configuracoes (
      chave        VARCHAR(100) PRIMARY KEY,
      valor        TEXT,
      atualizado_em TIMESTAMP DEFAULT NOW()
    )
  `);

  // Seed admin user
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@registrocivil.com';
  const adminPass  = process.env.ADMIN_PASSWORD || 'Admin@2024';
  const hash = await bcrypt.hash(adminPass, 10);
  await pool.query(
    `INSERT INTO usuarios (nome, email, senha_hash) VALUES ('Administrador', $1, $2) ON CONFLICT (email) DO NOTHING`,
    [adminEmail, hash]
  );
}

module.exports = { pool, initDb };
