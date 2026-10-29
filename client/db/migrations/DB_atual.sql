SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

DO $$ BEGIN
  COMMENT ON EXTENSION citext IS 'data type for case-insensitive character strings';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;

DO $TYPE$ BEGIN
  CREATE TYPE public.product_kind AS ENUM (
    'digital',
    'physical'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $TYPE$;

DO $TYPE$ BEGIN
  CREATE TYPE public.shipment_status AS ENUM (
    'preparing',
    'posted',
    'in_transit',
    'delivered',
    'returned',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $TYPE$;

DO $TYPE$ BEGIN
  CREATE TYPE public.stock_delivery_type AS ENUM (
    'key',
    'file',
    'infinite'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $TYPE$;

CREATE OR REPLACE FUNCTION public.enforce_same_store() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
DECLARE fk_val bigint; parent_store integer;
BEGIN
  EXECUTE format('SELECT ($1).%I', TG_ARGV[0]) INTO fk_val USING NEW;
  IF fk_val IS NULL THEN RETURN NEW; END IF;
  EXECUTE format('SELECT store_id FROM %I WHERE id = $1', TG_ARGV[1]) INTO parent_store USING fk_val;
  IF parent_store IS NOT NULL AND parent_store <> NEW.store_id THEN
    RAISE EXCEPTION 'cross-tenant reference: %.% (store %) -> %.id (store %)',
      TG_TABLE_NAME, TG_ARGV[0], NEW.store_id, TG_ARGV[1], parent_store
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $_$;

CREATE OR REPLACE FUNCTION public.set_categories_position() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.position IS NULL THEN
    SELECT COALESCE(MAX(position), 0) + 1 INTO NEW.position FROM categories;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_product_variation_position() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.position IS NULL THEN
    SELECT COALESCE(MAX(position), 0) + 1
    INTO NEW.position
    FROM product_variations
    WHERE product_id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_products_position() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.position IS NULL THEN
    SELECT COALESCE(MAX(position), 0) + 1 INTO NEW.position FROM products;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_variations_position() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.position IS NULL THEN
    SELECT COALESCE(MAX(position), 0) + 1 INTO NEW.position
    FROM product_variations WHERE product_id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$;

SET default_tablespace = '';

SET default_table_access_method = heap;

CREATE TABLE IF NOT EXISTS public.admin (
    id integer NOT NULL,
    email character varying(500) NOT NULL,
    role text DEFAULT 'admin'::text NOT NULL,
    blocked boolean DEFAULT false NOT NULL,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL,
    totp_secret text,
    totp_enabled boolean DEFAULT false NOT NULL,
    totp_last_step bigint,
    CONSTRAINT admin_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text, 'member'::text])))
);

ALTER TABLE ONLY public.admin FORCE ROW LEVEL SECURITY;

CREATE SEQUENCE IF NOT EXISTS public.admin_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.admin_id_seq OWNED BY public.admin.id;

CREATE TABLE IF NOT EXISTS public.admin_roles (
    admin_id integer NOT NULL,
    role_id integer NOT NULL,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL
);

ALTER TABLE ONLY public.admin_roles FORCE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.banners (
    id bigint NOT NULL,
    title text NOT NULL,
    subtitle text,
    image_url text NOT NULL,
    link text,
    "position" integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

DO $IDENT$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = 'public.banners'::regclass AND a.attname = 'id' AND a.attidentity <> ''
  ) THEN
    ALTER TABLE public.banners ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.banners_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
    );
  END IF;
END $IDENT$;

CREATE TABLE IF NOT EXISTS public.carriers (
    id bigint NOT NULL,
    name text NOT NULL,
    service_code text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    melhor_envio_service_id integer,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL
);

ALTER TABLE ONLY public.carriers FORCE ROW LEVEL SECURITY;

DO $IDENT$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = 'public.carriers'::regclass AND a.attname = 'id' AND a.attidentity <> ''
  ) THEN
    ALTER TABLE public.carriers ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.carriers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
    );
  END IF;
END $IDENT$;

CREATE TABLE IF NOT EXISTS public.cart_items (
    id integer NOT NULL,
    user_id integer NOT NULL,
    product_id integer NOT NULL,
    variation_id integer,
    quantity integer DEFAULT 1 NOT NULL,
    added_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL,
    recovery_email_sent_at timestamp with time zone,
    CONSTRAINT cart_items_quantity_check CHECK ((quantity > 0))
);

ALTER TABLE ONLY public.cart_items FORCE ROW LEVEL SECURITY;

CREATE SEQUENCE IF NOT EXISTS public.cart_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.cart_items_id_seq OWNED BY public.cart_items.id;

CREATE TABLE IF NOT EXISTS public.categories (
    id bigint NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    image_url text,
    "position" integer,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL
);

ALTER TABLE ONLY public.categories FORCE ROW LEVEL SECURITY;

DO $IDENT$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = 'public.categories'::regclass AND a.attname = 'id' AND a.attidentity <> ''
  ) THEN
    ALTER TABLE public.categories ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.categories_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
    );
  END IF;
END $IDENT$;

CREATE TABLE IF NOT EXISTS public.chat_conversations (
    id bigint NOT NULL,
    customer_email public.citext NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    assigned_admin_email public.citext,
    last_message_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    order_id bigint,
    is_ticket boolean DEFAULT false NOT NULL,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL
);

ALTER TABLE ONLY public.chat_conversations FORCE ROW LEVEL SECURITY;

DO $IDENT$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = 'public.chat_conversations'::regclass AND a.attname = 'id' AND a.attidentity <> ''
  ) THEN
    ALTER TABLE public.chat_conversations ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.chat_conversations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
    );
  END IF;
END $IDENT$;

CREATE TABLE IF NOT EXISTS public.chat_messages (
    id bigint NOT NULL,
    conversation_id bigint NOT NULL,
    sender_type text NOT NULL,
    sender_email public.citext NOT NULL,
    body text,
    read_by_staff boolean DEFAULT false NOT NULL,
    read_by_customer boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    attachment_url text,
    attachment_type text,
    attachment_name text,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL,
    CONSTRAINT chat_messages_sender_type_check CHECK ((sender_type = ANY (ARRAY['customer'::text, 'staff'::text])))
);

ALTER TABLE ONLY public.chat_messages FORCE ROW LEVEL SECURITY;

DO $IDENT$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = 'public.chat_messages'::regclass AND a.attname = 'id' AND a.attidentity <> ''
  ) THEN
    ALTER TABLE public.chat_messages ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.chat_messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
    );
  END IF;
END $IDENT$;

CREATE TABLE IF NOT EXISTS public.chat_typing (
    conversation_id bigint NOT NULL,
    sender_type text NOT NULL,
    sender_email public.citext NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL,
    CONSTRAINT chat_typing_sender_type_check CHECK ((sender_type = ANY (ARRAY['customer'::text, 'staff'::text])))
);

ALTER TABLE ONLY public.chat_typing FORCE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.coupons (
    id bigint NOT NULL,
    code text NOT NULL,
    percent_off numeric(5,2) NOT NULL,
    usage_limit integer DEFAULT 0 NOT NULL,
    used_count integer DEFAULT 0 NOT NULL,
    min_order_value numeric(10,2),
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL,
    per_user_limit integer DEFAULT 0 NOT NULL,
    CONSTRAINT coupons_percent_off_check CHECK (((percent_off >= (0)::numeric) AND (percent_off <= (100)::numeric)))
);

ALTER TABLE ONLY public.coupons FORCE ROW LEVEL SECURITY;

DO $IDENT$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = 'public.coupons'::regclass AND a.attname = 'id' AND a.attidentity <> ''
  ) THEN
    ALTER TABLE public.coupons ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.coupons_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
    );
  END IF;
END $IDENT$;

CREATE TABLE IF NOT EXISTS public.customer_profiles (
    email public.citext NOT NULL,
    full_name text,
    phone text,
    cep text,
    street text,
    number text,
    complement text,
    neighborhood text,
    city text,
    state character(2),
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cpf text,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL
);

ALTER TABLE ONLY public.customer_profiles FORCE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.data_subject_requests (
    id integer NOT NULL,
    user_id integer NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    processed_by text,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL,
    CONSTRAINT data_subject_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text])))
);

ALTER TABLE ONLY public.data_subject_requests FORCE ROW LEVEL SECURITY;

CREATE SEQUENCE IF NOT EXISTS public.data_subject_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.data_subject_requests_id_seq OWNED BY public.data_subject_requests.id;

CREATE TABLE IF NOT EXISTS public.delivery_failures (
    id integer NOT NULL,
    order_id integer,
    stage text NOT NULL,
    error_message text,
    resolved_at timestamp with time zone,
    resolved_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL
);

ALTER TABLE ONLY public.delivery_failures FORCE ROW LEVEL SECURITY;

CREATE SEQUENCE IF NOT EXISTS public.delivery_failures_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.delivery_failures_id_seq OWNED BY public.delivery_failures.id;

CREATE TABLE IF NOT EXISTS public.dev_users (
    id bigint NOT NULL,
    email public.citext NOT NULL,
    password_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

DO $IDENT$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = 'public.dev_users'::regclass AND a.attname = 'id' AND a.attidentity <> ''
  ) THEN
    ALTER TABLE public.dev_users ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.dev_users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
    );
  END IF;
END $IDENT$;

CREATE TABLE IF NOT EXISTS public.discuser (
    id integer NOT NULL,
    username text NOT NULL,
    email public.citext NOT NULL,
    access_token text NOT NULL,
    refresh_token text NOT NULL,
    expires_in public.citext NOT NULL,
    user_id bigint,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL
);

ALTER TABLE ONLY public.discuser FORCE ROW LEVEL SECURITY;

CREATE SEQUENCE IF NOT EXISTS public.discuser_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.discuser_id_seq OWNED BY public.discuser.id;

CREATE TABLE IF NOT EXISTS public.email_codes (
    email text NOT NULL,
    code_hash text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL
);

ALTER TABLE ONLY public.email_codes FORCE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.email_verification (
    id integer NOT NULL,
    email text NOT NULL,
    code_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL
);

ALTER TABLE ONLY public.email_verification FORCE ROW LEVEL SECURITY;

CREATE SEQUENCE IF NOT EXISTS public.email_verification_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.email_verification_id_seq OWNED BY public.email_verification.id;

CREATE TABLE IF NOT EXISTS public.googleuser (
    id integer NOT NULL,
    username text,
    email public.citext,
    access_token text,
    refresh_token text,
    expires_in integer,
    user_id bigint,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL
);

ALTER TABLE ONLY public.googleuser FORCE ROW LEVEL SECURITY;

CREATE SEQUENCE IF NOT EXISTS public.googleuser_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.googleuser_id_seq OWNED BY public.googleuser.id;

CREATE TABLE IF NOT EXISTS public.home_banners (
    id bigint NOT NULL,
    title text NOT NULL,
    subtitle text,
    image_url text NOT NULL,
    link text,
    active boolean DEFAULT true NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL
);

ALTER TABLE ONLY public.home_banners FORCE ROW LEVEL SECURITY;

DO $IDENT$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = 'public.home_banners'::regclass AND a.attname = 'id' AND a.attidentity <> ''
  ) THEN
    ALTER TABLE public.home_banners ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.home_banners_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
    );
  END IF;
END $IDENT$;

CREATE TABLE IF NOT EXISTS public.logintoken (
    id integer NOT NULL,
    user_id integer NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL
);

ALTER TABLE ONLY public.logintoken FORCE ROW LEVEL SECURITY;

CREATE SEQUENCE IF NOT EXISTS public.logintoken_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.logintoken_id_seq OWNED BY public.logintoken.id;

CREATE TABLE IF NOT EXISTS public.melhor_envio_credentials (
    id bigint NOT NULL,
    access_token_encrypted text,
    sandbox boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL
);

ALTER TABLE ONLY public.melhor_envio_credentials FORCE ROW LEVEL SECURITY;

DO $IDENT$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = 'public.melhor_envio_credentials'::regclass AND a.attname = 'id' AND a.attidentity <> ''
  ) THEN
    ALTER TABLE public.melhor_envio_credentials ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.melhor_envio_credentials_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
    );
  END IF;
END $IDENT$;

CREATE TABLE IF NOT EXISTS public.mercadopago_credentials (
    id bigint NOT NULL,
    access_token_encrypted text,
    public_key text,
    webhook_secret_encrypted text,
    sandbox boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL
);

ALTER TABLE ONLY public.mercadopago_credentials FORCE ROW LEVEL SECURITY;

DO $IDENT$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = 'public.mercadopago_credentials'::regclass AND a.attname = 'id' AND a.attidentity <> ''
  ) THEN
    ALTER TABLE public.mercadopago_credentials ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.mercadopago_credentials_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
    );
  END IF;
END $IDENT$;

CREATE TABLE IF NOT EXISTS public.notifications (
    id integer NOT NULL,
    user_id integer NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text,
    data jsonb,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL
);

ALTER TABLE ONLY public.notifications FORCE ROW LEVEL SECURITY;

CREATE SEQUENCE IF NOT EXISTS public.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;

CREATE TABLE IF NOT EXISTS public.order_items (
    id bigint NOT NULL,
    order_id bigint NOT NULL,
    product_id bigint NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    product_type public.product_kind DEFAULT 'digital'::public.product_kind NOT NULL,
    delivered_at timestamp with time zone,
    variation_id bigint,
    product_name text DEFAULT ''::text NOT NULL,
    variation_name text,
    delivered_content text,
    delivered_file_size bigint,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL
);

ALTER TABLE ONLY public.order_items FORCE ROW LEVEL SECURITY;

DO $IDENT$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = 'public.order_items'::regclass AND a.attname = 'id' AND a.attidentity <> ''
  ) THEN
    ALTER TABLE public.order_items ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.order_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
    );
  END IF;
END $IDENT$;

CREATE TABLE IF NOT EXISTS public.orders (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    payment_provider text,
    payment_method text,
    payment_ref text,
    shipping_fee numeric(10,2) DEFAULT 0 NOT NULL,
    shipping_address_id bigint,
    paid_at timestamp with time zone,
    subtotal numeric(10,2) DEFAULT 0 NOT NULL,
    platform_fee numeric(10,2) DEFAULT 0 NOT NULL,
    discount numeric(10,2) DEFAULT 0 NOT NULL,
    user_id bigint,
    total numeric(10,2) DEFAULT 0 NOT NULL,
    coupon_id bigint,
    order_number text,
    reseller_id integer,
    attention_note text,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL,
    terms_accepted_at timestamp with time zone
);

ALTER TABLE ONLY public.orders FORCE ROW LEVEL SECURITY;

DO $IDENT$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = 'public.orders'::regclass AND a.attname = 'id' AND a.attidentity <> ''
  ) THEN
    ALTER TABLE public.orders ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.orders_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
    );
  END IF;
END $IDENT$;

CREATE TABLE IF NOT EXISTS public.page_views (
    id bigint NOT NULL,
    path text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL
);

ALTER TABLE ONLY public.page_views FORCE ROW LEVEL SECURITY;

DO $IDENT$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = 'public.page_views'::regclass AND a.attname = 'id' AND a.attidentity <> ''
  ) THEN
    ALTER TABLE public.page_views ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.page_views_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
    );
  END IF;
END $IDENT$;

CREATE TABLE IF NOT EXISTS public.payment_transactions (
    id bigint NOT NULL,
    order_id bigint NOT NULL,
    provider text DEFAULT 'mercadopago'::text NOT NULL,
    provider_txid text,
    method text NOT NULL,
    status text DEFAULT 'created'::text NOT NULL,
    amount numeric(10,2) NOT NULL,
    idempotency_key text,
    raw_payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL,
    CONSTRAINT payment_transactions_method_check CHECK ((method = ANY (ARRAY['pix'::text, 'credit_card'::text, 'debit_card'::text, 'boleto'::text]))),
    CONSTRAINT payment_transactions_status_check CHECK ((status = ANY (ARRAY['created'::text, 'pending'::text, 'paid'::text, 'expired'::text, 'failed'::text, 'refunded'::text])))
);

ALTER TABLE ONLY public.payment_transactions FORCE ROW LEVEL SECURITY;

DO $IDENT$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = 'public.payment_transactions'::regclass AND a.attname = 'id' AND a.attidentity <> ''
  ) THEN
    ALTER TABLE public.payment_transactions ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.payment_transactions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
    );
  END IF;
END $IDENT$;

CREATE TABLE IF NOT EXISTS public.product_images (
    id bigint NOT NULL,
    product_id bigint NOT NULL,
    url text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL
);

ALTER TABLE ONLY public.product_images FORCE ROW LEVEL SECURITY;

DO $IDENT$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = 'public.product_images'::regclass AND a.attname = 'id' AND a.attidentity <> ''
  ) THEN
    ALTER TABLE public.product_images ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.product_images_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
    );
  END IF;
END $IDENT$;

CREATE TABLE IF NOT EXISTS public.product_question_messages (
    id integer NOT NULL,
    question_id integer NOT NULL,
    author_type text NOT NULL,
    author_name text,
    user_id integer,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL,
    CONSTRAINT product_question_messages_author_type_check CHECK ((author_type = ANY (ARRAY['customer'::text, 'staff'::text])))
);

ALTER TABLE ONLY public.product_question_messages FORCE ROW LEVEL SECURITY;

CREATE SEQUENCE IF NOT EXISTS public.product_question_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.product_question_messages_id_seq OWNED BY public.product_question_messages.id;

CREATE TABLE IF NOT EXISTS public.product_questions (
    id integer NOT NULL,
    product_id integer NOT NULL,
    user_id integer,
    asker_name text,
    question text NOT NULL,
    answer text,
    answered_by text,
    answered_at timestamp with time zone,
    hidden boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    staff_unread boolean DEFAULT false NOT NULL,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL
);

ALTER TABLE ONLY public.product_questions FORCE ROW LEVEL SECURITY;

CREATE SEQUENCE IF NOT EXISTS public.product_questions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.product_questions_id_seq OWNED BY public.product_questions.id;

CREATE TABLE IF NOT EXISTS public.product_reviews (
    id integer NOT NULL,
    product_id integer NOT NULL,
    user_id integer,
    order_id integer,
    reviewer_name text,
    rating smallint NOT NULL,
    comment text,
    image_urls text[] DEFAULT '{}'::text[] NOT NULL,
    hidden boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL,
    CONSTRAINT product_reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);

ALTER TABLE ONLY public.product_reviews FORCE ROW LEVEL SECURITY;

CREATE SEQUENCE IF NOT EXISTS public.product_reviews_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.product_reviews_id_seq OWNED BY public.product_reviews.id;

CREATE TABLE IF NOT EXISTS public.product_variations (
    id integer NOT NULL,
    product_id integer NOT NULL,
    name text NOT NULL,
    price numeric(10,2) NOT NULL,
    "position" integer,
    stock_type public.stock_delivery_type DEFAULT 'key'::public.stock_delivery_type,
    stock_content text,
    stock_count integer DEFAULT 0,
    is_unlimited boolean DEFAULT false,
    sku text,
    weight_grams integer,
    length_cm numeric(6,2),
    width_cm numeric(6,2),
    height_cm numeric(6,2),
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL,
    key_validity_days integer
);

ALTER TABLE ONLY public.product_variations FORCE ROW LEVEL SECURITY;

CREATE SEQUENCE IF NOT EXISTS public.product_variations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.product_variations_id_seq OWNED BY public.product_variations.id;

CREATE TABLE IF NOT EXISTS public.products (
    id bigint NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    price numeric(10,2) NOT NULL,
    category_id bigint,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    slug text,
    "position" integer,
    stock_type public.stock_delivery_type DEFAULT 'key'::public.stock_delivery_type,
    stock_content text,
    stock_count integer DEFAULT 0,
    is_unlimited boolean DEFAULT false,
    product_type public.product_kind DEFAULT 'digital'::public.product_kind NOT NULL,
    sku text,
    weight_grams integer,
    length_cm numeric(6,2),
    width_cm numeric(6,2),
    height_cm numeric(6,2),
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL,
    key_validity_days integer
);

ALTER TABLE ONLY public.products FORCE ROW LEVEL SECURITY;

DO $IDENT$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = 'public.products'::regclass AND a.attname = 'id' AND a.attidentity <> ''
  ) THEN
    ALTER TABLE public.products ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.products_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
    );
  END IF;
END $IDENT$;

CREATE TABLE IF NOT EXISTS public.reseller_commissions (
    id integer NOT NULL,
    reseller_id integer NOT NULL,
    order_id integer NOT NULL,
    order_item_id integer,
    product_id integer,
    product_name text NOT NULL,
    sale_amount numeric(10,2) NOT NULL,
    commission_percent numeric(5,2) NOT NULL,
    commission_amount numeric(10,2) NOT NULL,
    status text DEFAULT 'confirmed'::text NOT NULL,
    payout_request_id integer,
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL
);

ALTER TABLE ONLY public.reseller_commissions FORCE ROW LEVEL SECURITY;

CREATE SEQUENCE IF NOT EXISTS public.reseller_commissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.reseller_commissions_id_seq OWNED BY public.reseller_commissions.id;

CREATE TABLE IF NOT EXISTS public.reseller_payout_requests (
    id integer NOT NULL,
    reseller_id integer NOT NULL,
    amount numeric(10,2) NOT NULL,
    status text DEFAULT 'requested'::text NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    resolved_by text,
    note text,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL
);

ALTER TABLE ONLY public.reseller_payout_requests FORCE ROW LEVEL SECURITY;

CREATE SEQUENCE IF NOT EXISTS public.reseller_payout_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.reseller_payout_requests_id_seq OWNED BY public.reseller_payout_requests.id;

CREATE TABLE IF NOT EXISTS public.reseller_products (
    id integer NOT NULL,
    reseller_id integer NOT NULL,
    product_id integer NOT NULL,
    commission_percent numeric(5,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL
);

ALTER TABLE ONLY public.reseller_products FORCE ROW LEVEL SECURITY;

CREATE SEQUENCE IF NOT EXISTS public.reseller_products_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.reseller_products_id_seq OWNED BY public.reseller_products.id;

CREATE TABLE IF NOT EXISTS public.resellers (
    id integer NOT NULL,
    user_id integer NOT NULL,
    referral_code text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    display_name text,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    approved_at timestamp with time zone,
    approved_by text,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    pix_key text,
    pix_key_type text,
    pix_holder_name text,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL
);

ALTER TABLE ONLY public.resellers FORCE ROW LEVEL SECURITY;

CREATE SEQUENCE IF NOT EXISTS public.resellers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.resellers_id_seq OWNED BY public.resellers.id;

CREATE TABLE IF NOT EXISTS public.shipment_events (
    id bigint NOT NULL,
    shipment_id bigint NOT NULL,
    status public.shipment_status NOT NULL,
    city text,
    state character(2),
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL
);

ALTER TABLE ONLY public.shipment_events FORCE ROW LEVEL SECURITY;

DO $IDENT$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = 'public.shipment_events'::regclass AND a.attname = 'id' AND a.attidentity <> ''
  ) THEN
    ALTER TABLE public.shipment_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.shipment_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
    );
  END IF;
END $IDENT$;

CREATE TABLE IF NOT EXISTS public.shipments (
    id bigint NOT NULL,
    order_id bigint NOT NULL,
    carrier_id bigint,
    tracking_code text,
    status public.shipment_status DEFAULT 'preparing'::public.shipment_status NOT NULL,
    shipping_cost numeric(10,2),
    shipped_at timestamp with time zone,
    delivered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tracking_generated boolean DEFAULT false NOT NULL,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL
);

ALTER TABLE ONLY public.shipments FORCE ROW LEVEL SECURITY;

DO $IDENT$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = 'public.shipments'::regclass AND a.attname = 'id' AND a.attidentity <> ''
  ) THEN
    ALTER TABLE public.shipments ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.shipments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
    );
  END IF;
END $IDENT$;

CREATE TABLE IF NOT EXISTS public.shipping_addresses (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    recipient_name text NOT NULL,
    cep text NOT NULL,
    street text NOT NULL,
    number text NOT NULL,
    complement text,
    neighborhood text NOT NULL,
    city text NOT NULL,
    state character(2) NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL
);

ALTER TABLE ONLY public.shipping_addresses FORCE ROW LEVEL SECURITY;

DO $IDENT$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = 'public.shipping_addresses'::regclass AND a.attname = 'id' AND a.attidentity <> ''
  ) THEN
    ALTER TABLE public.shipping_addresses ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.shipping_addresses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
    );
  END IF;
END $IDENT$;

CREATE TABLE IF NOT EXISTS public.shipping_quotes (
    id bigint NOT NULL,
    order_id bigint,
    carrier_id bigint,
    service_name text,
    price numeric(10,2) NOT NULL,
    eta_days integer,
    selected boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL
);

ALTER TABLE ONLY public.shipping_quotes FORCE ROW LEVEL SECURITY;

DO $IDENT$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = 'public.shipping_quotes'::regclass AND a.attname = 'id' AND a.attidentity <> ''
  ) THEN
    ALTER TABLE public.shipping_quotes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.shipping_quotes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
    );
  END IF;
END $IDENT$;

CREATE TABLE IF NOT EXISTS public.stock_keys (
    id integer NOT NULL,
    product_id integer,
    variation_id integer,
    key_content text NOT NULL,
    is_sold boolean DEFAULT false,
    order_id integer,
    sold_at timestamp without time zone,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL,
    expires_at timestamp without time zone,
    CONSTRAINT one_target CHECK ((((product_id IS NOT NULL) AND (variation_id IS NULL)) OR ((product_id IS NULL) AND (variation_id IS NOT NULL))))
);

ALTER TABLE ONLY public.stock_keys FORCE ROW LEVEL SECURITY;

CREATE SEQUENCE IF NOT EXISTS public.stock_keys_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.stock_keys_id_seq OWNED BY public.stock_keys.id;

CREATE TABLE IF NOT EXISTS public.stock_movements (
    id integer NOT NULL,
    product_id integer,
    variation_id integer,
    product_name text NOT NULL,
    variation_name text,
    change integer NOT NULL,
    reason text NOT NULL,
    order_id integer,
    note text,
    staff_email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL
);

ALTER TABLE ONLY public.stock_movements FORCE ROW LEVEL SECURITY;

CREATE SEQUENCE IF NOT EXISTS public.stock_movements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.stock_movements_id_seq OWNED BY public.stock_movements.id;

CREATE TABLE IF NOT EXISTS public.store_promotion_settings (
    id bigint NOT NULL,
    discount_tiers jsonb DEFAULT '[]'::jsonb NOT NULL,
    free_shipping_enabled boolean DEFAULT true NOT NULL,
    free_shipping_threshold numeric(10,2) DEFAULT 150 NOT NULL,
    min_order_value numeric(10,2) DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL
);

ALTER TABLE ONLY public.store_promotion_settings FORCE ROW LEVEL SECURITY;

DO $IDENT$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = 'public.store_promotion_settings'::regclass AND a.attname = 'id' AND a.attidentity <> ''
  ) THEN
    ALTER TABLE public.store_promotion_settings ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.store_promotion_settings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
    );
  END IF;
END $IDENT$;

CREATE TABLE IF NOT EXISTS public.store_settings (
    id bigint NOT NULL,
    primary_color text DEFAULT '#b700ff'::text NOT NULL,
    secondary_color text DEFAULT '#6400ff'::text NOT NULL,
    logo_url text,
    background_style text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    background_img_url text,
    background_css text,
    store_name text,
    platform_fee_percent numeric(5,2) DEFAULT 0 NOT NULL,
    platform_fee_fixed numeric(10,2) DEFAULT 0 NOT NULL,
    shipping_markup_percent numeric(5,2) DEFAULT 0 NOT NULL,
    shipping_markup_fixed numeric(10,2) DEFAULT 0 NOT NULL,
    accepts_pix boolean DEFAULT true NOT NULL,
    accepts_credit_card boolean DEFAULT false NOT NULL,
    accepts_boleto boolean DEFAULT false NOT NULL,
    origin_cep text,
    suspended boolean DEFAULT false NOT NULL,
    suspended_reason text,
    accepts_debit_card boolean DEFAULT true NOT NULL,
    chat_encryption_key text,
    background_solid_color text,
    home_config jsonb,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL,
    legal_name text,
    document text,
    address text,
    contact_email text,
    contact_phone text,
    privacy_policy text,
    returns_policy text,
    store_terms text,
    platform_terms_accepted_at timestamp with time zone,
    platform_terms_version text,
    platform_terms_accepted_by text
);

ALTER TABLE ONLY public.store_settings FORCE ROW LEVEL SECURITY;

DO $IDENT$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = 'public.store_settings'::regclass AND a.attname = 'id' AND a.attidentity <> ''
  ) THEN
    ALTER TABLE public.store_settings ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.store_settings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
    );
  END IF;
END $IDENT$;

CREATE TABLE IF NOT EXISTS public.store_settings_old_rows (
    id bigint,
    primary_color text,
    secondary_color text,
    logo_url text,
    background_style text,
    updated_at timestamp with time zone,
    background_img_url text,
    background_css text,
    store_name text,
    platform_fee_percent numeric(5,2),
    platform_fee_fixed numeric(10,2),
    shipping_markup_percent numeric(5,2),
    shipping_markup_fixed numeric(10,2),
    accepts_pix boolean,
    accepts_credit_card boolean,
    accepts_boleto boolean,
    origin_cep text,
    suspended boolean,
    suspended_reason text,
    accepts_debit_card boolean,
    chat_encryption_key text,
    background_solid_color text,
    home_config jsonb,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer,
    address text,
    contact_email text,
    contact_phone text,
    document text,
    legal_name text,
    platform_terms_accepted_at timestamp with time zone,
    platform_terms_accepted_by text,
    platform_terms_version text,
    privacy_policy text,
    returns_policy text,
    store_terms text
);

ALTER TABLE ONLY public.store_settings_old_rows FORCE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.stores (
    id integer NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    custom_domain text,
    status text DEFAULT 'active'::text NOT NULL,
    suspended_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stores_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'disabled'::text])))
);

DO $IDENT$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = 'public.stores'::regclass AND a.attname = 'id' AND a.attidentity <> ''
  ) THEN
    ALTER TABLE public.stores ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.stores_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
    );
  END IF;
END $IDENT$;

CREATE TABLE IF NOT EXISTS public.team_audit_log (
    id integer NOT NULL,
    actor_email text NOT NULL,
    action text NOT NULL,
    target text,
    details jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL
);

ALTER TABLE ONLY public.team_audit_log FORCE ROW LEVEL SECURITY;

CREATE SEQUENCE IF NOT EXISTS public.team_audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.team_audit_log_id_seq OWNED BY public.team_audit_log.id;

CREATE TABLE IF NOT EXISTS public.team_base_permissions (
    role text NOT NULL,
    permissions text[] DEFAULT '{}'::text[] NOT NULL,
    updated_by text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL
);

ALTER TABLE ONLY public.team_base_permissions FORCE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.team_roles (
    id integer NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#99aab5'::text NOT NULL,
    "position" integer DEFAULT 1 NOT NULL,
    permissions text[] DEFAULT '{}'::text[] NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL
);

ALTER TABLE ONLY public.team_roles FORCE ROW LEVEL SECURITY;

CREATE SEQUENCE IF NOT EXISTS public.team_roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.team_roles_id_seq OWNED BY public.team_roles.id;

CREATE TABLE IF NOT EXISTS public.users (
    id integer NOT NULL,
    email character varying(500) NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    username text,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL
);

ALTER TABLE ONLY public.users FORCE ROW LEVEL SECURITY;

CREATE SEQUENCE IF NOT EXISTS public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;

CREATE TABLE IF NOT EXISTS public.wallet_ledger (
    id bigint NOT NULL,
    order_id bigint,
    withdrawal_request_id bigint,
    type text NOT NULL,
    amount numeric(10,2) NOT NULL,
    balance_after numeric(10,2) NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wallet_ledger_type_check CHECK ((type = ANY (ARRAY['sale_credit'::text, 'withdrawal_debit'::text, 'refund_debit'::text, 'adjustment'::text])))
);

DO $IDENT$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = 'public.wallet_ledger'::regclass AND a.attname = 'id' AND a.attidentity <> ''
  ) THEN
    ALTER TABLE public.wallet_ledger ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.wallet_ledger_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
    );
  END IF;
END $IDENT$;

CREATE TABLE IF NOT EXISTS public.wishlist_items (
    id integer NOT NULL,
    user_id integer NOT NULL,
    product_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id integer DEFAULT (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer NOT NULL
);

ALTER TABLE ONLY public.wishlist_items FORCE ROW LEVEL SECURITY;

CREATE SEQUENCE IF NOT EXISTS public.wishlist_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.wishlist_items_id_seq OWNED BY public.wishlist_items.id;

CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
    id bigint NOT NULL,
    requested_by_admin_id bigint NOT NULL,
    amount numeric(10,2) NOT NULL,
    payout_method text,
    payout_details text,
    status text DEFAULT 'pending'::text NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    processed_by_admin_id bigint,
    processed_by_dev_id bigint,
    CONSTRAINT withdrawal_requests_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT withdrawal_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'paid'::text, 'rejected'::text])))
);

DO $IDENT$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = 'public.withdrawal_requests'::regclass AND a.attname = 'id' AND a.attidentity <> ''
  ) THEN
    ALTER TABLE public.withdrawal_requests ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.withdrawal_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
    );
  END IF;
END $IDENT$;

ALTER TABLE ONLY public.admin ALTER COLUMN id SET DEFAULT nextval('public.admin_id_seq'::regclass);

ALTER TABLE ONLY public.cart_items ALTER COLUMN id SET DEFAULT nextval('public.cart_items_id_seq'::regclass);

ALTER TABLE ONLY public.data_subject_requests ALTER COLUMN id SET DEFAULT nextval('public.data_subject_requests_id_seq'::regclass);

ALTER TABLE ONLY public.delivery_failures ALTER COLUMN id SET DEFAULT nextval('public.delivery_failures_id_seq'::regclass);

ALTER TABLE ONLY public.discuser ALTER COLUMN id SET DEFAULT nextval('public.discuser_id_seq'::regclass);

ALTER TABLE ONLY public.email_verification ALTER COLUMN id SET DEFAULT nextval('public.email_verification_id_seq'::regclass);

ALTER TABLE ONLY public.googleuser ALTER COLUMN id SET DEFAULT nextval('public.googleuser_id_seq'::regclass);

ALTER TABLE ONLY public.logintoken ALTER COLUMN id SET DEFAULT nextval('public.logintoken_id_seq'::regclass);

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);

ALTER TABLE ONLY public.product_question_messages ALTER COLUMN id SET DEFAULT nextval('public.product_question_messages_id_seq'::regclass);

ALTER TABLE ONLY public.product_questions ALTER COLUMN id SET DEFAULT nextval('public.product_questions_id_seq'::regclass);

ALTER TABLE ONLY public.product_reviews ALTER COLUMN id SET DEFAULT nextval('public.product_reviews_id_seq'::regclass);

ALTER TABLE ONLY public.product_variations ALTER COLUMN id SET DEFAULT nextval('public.product_variations_id_seq'::regclass);

ALTER TABLE ONLY public.reseller_commissions ALTER COLUMN id SET DEFAULT nextval('public.reseller_commissions_id_seq'::regclass);

ALTER TABLE ONLY public.reseller_payout_requests ALTER COLUMN id SET DEFAULT nextval('public.reseller_payout_requests_id_seq'::regclass);

ALTER TABLE ONLY public.reseller_products ALTER COLUMN id SET DEFAULT nextval('public.reseller_products_id_seq'::regclass);

ALTER TABLE ONLY public.resellers ALTER COLUMN id SET DEFAULT nextval('public.resellers_id_seq'::regclass);

ALTER TABLE ONLY public.stock_keys ALTER COLUMN id SET DEFAULT nextval('public.stock_keys_id_seq'::regclass);

ALTER TABLE ONLY public.stock_movements ALTER COLUMN id SET DEFAULT nextval('public.stock_movements_id_seq'::regclass);

ALTER TABLE ONLY public.team_audit_log ALTER COLUMN id SET DEFAULT nextval('public.team_audit_log_id_seq'::regclass);

ALTER TABLE ONLY public.team_roles ALTER COLUMN id SET DEFAULT nextval('public.team_roles_id_seq'::regclass);

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);

ALTER TABLE ONLY public.wishlist_items ALTER COLUMN id SET DEFAULT nextval('public.wishlist_items_id_seq'::regclass);

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.admin ADD CONSTRAINT admin_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.admin_roles ADD CONSTRAINT admin_roles_pkey PRIMARY KEY (admin_id, role_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.banners ADD CONSTRAINT banners_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.carriers ADD CONSTRAINT carriers_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.cart_items ADD CONSTRAINT cart_items_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.categories ADD CONSTRAINT categories_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.chat_conversations ADD CONSTRAINT chat_conversations_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.chat_messages ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.chat_typing ADD CONSTRAINT chat_typing_pkey PRIMARY KEY (conversation_id, sender_email);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.coupons ADD CONSTRAINT coupons_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.customer_profiles ADD CONSTRAINT customer_profiles_pkey PRIMARY KEY (store_id, email);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.data_subject_requests ADD CONSTRAINT data_subject_requests_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.delivery_failures ADD CONSTRAINT delivery_failures_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.dev_users ADD CONSTRAINT dev_users_email_key UNIQUE (email);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.dev_users ADD CONSTRAINT dev_users_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.discuser ADD CONSTRAINT discuser_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.email_codes ADD CONSTRAINT email_codes_pkey PRIMARY KEY (store_id, email);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.email_verification ADD CONSTRAINT email_verification_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.googleuser ADD CONSTRAINT googleuser_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.home_banners ADD CONSTRAINT home_banners_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.logintoken ADD CONSTRAINT logintoken_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.melhor_envio_credentials ADD CONSTRAINT melhor_envio_credentials_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.mercadopago_credentials ADD CONSTRAINT mercadopago_credentials_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.order_items ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.orders ADD CONSTRAINT orders_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.page_views ADD CONSTRAINT page_views_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.payment_transactions ADD CONSTRAINT payment_transactions_idempotency_key_key UNIQUE (idempotency_key);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.payment_transactions ADD CONSTRAINT payment_transactions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.product_images ADD CONSTRAINT product_images_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.product_question_messages ADD CONSTRAINT product_question_messages_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.product_questions ADD CONSTRAINT product_questions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.product_reviews ADD CONSTRAINT product_reviews_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.product_variations ADD CONSTRAINT product_variations_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.products ADD CONSTRAINT products_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.reseller_commissions ADD CONSTRAINT reseller_commissions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.reseller_payout_requests ADD CONSTRAINT reseller_payout_requests_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.reseller_products ADD CONSTRAINT reseller_products_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.reseller_products ADD CONSTRAINT reseller_products_reseller_id_product_id_key UNIQUE (reseller_id, product_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.resellers ADD CONSTRAINT resellers_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.shipment_events ADD CONSTRAINT shipment_events_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.shipments ADD CONSTRAINT shipments_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.shipping_addresses ADD CONSTRAINT shipping_addresses_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.shipping_quotes ADD CONSTRAINT shipping_quotes_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.stock_keys ADD CONSTRAINT stock_keys_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.stock_movements ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.store_promotion_settings ADD CONSTRAINT store_promotion_settings_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.store_settings ADD CONSTRAINT store_settings_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.stores ADD CONSTRAINT stores_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.team_audit_log ADD CONSTRAINT team_audit_log_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.team_base_permissions ADD CONSTRAINT team_base_permissions_pkey PRIMARY KEY (store_id, role);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.team_roles ADD CONSTRAINT team_roles_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.wallet_ledger ADD CONSTRAINT wallet_ledger_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.wishlist_items ADD CONSTRAINT wishlist_items_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.wishlist_items ADD CONSTRAINT wishlist_items_user_id_product_id_key UNIQUE (user_id, product_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.withdrawal_requests ADD CONSTRAINT withdrawal_requests_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

CREATE INDEX IF NOT EXISTS admin_roles_store_idx ON public.admin_roles USING btree (store_id);

CREATE UNIQUE INDEX IF NOT EXISTS admin_store_email_key ON public.admin USING btree (store_id, email);

CREATE INDEX IF NOT EXISTS admin_store_idx ON public.admin USING btree (store_id);

CREATE INDEX IF NOT EXISTS carriers_store_idx ON public.carriers USING btree (store_id);

CREATE UNIQUE INDEX IF NOT EXISTS carriers_store_melhor_envio_idx ON public.carriers USING btree (store_id, melhor_envio_service_id) WHERE (melhor_envio_service_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS cart_items_store_idx ON public.cart_items USING btree (store_id);

CREATE UNIQUE INDEX IF NOT EXISTS cart_items_unique_no_variation ON public.cart_items USING btree (user_id, product_id) WHERE (variation_id IS NULL);

CREATE UNIQUE INDEX IF NOT EXISTS cart_items_unique_with_variation ON public.cart_items USING btree (user_id, product_id, variation_id) WHERE (variation_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS categories_store_idx ON public.categories USING btree (store_id);

CREATE UNIQUE INDEX IF NOT EXISTS categories_store_slug_key ON public.categories USING btree (store_id, slug);

CREATE INDEX IF NOT EXISTS chat_conversations_store_idx ON public.chat_conversations USING btree (store_id);

CREATE INDEX IF NOT EXISTS chat_conversations_ticket_idx ON public.chat_conversations USING btree (is_ticket, status);

CREATE INDEX IF NOT EXISTS chat_messages_store_idx ON public.chat_messages USING btree (store_id);

CREATE INDEX IF NOT EXISTS chat_typing_store_idx ON public.chat_typing USING btree (store_id);

CREATE UNIQUE INDEX IF NOT EXISTS coupons_store_code_key ON public.coupons USING btree (store_id, code);

CREATE INDEX IF NOT EXISTS coupons_store_idx ON public.coupons USING btree (store_id);

CREATE INDEX IF NOT EXISTS customer_profiles_store_idx ON public.customer_profiles USING btree (store_id);

CREATE INDEX IF NOT EXISTS data_subject_requests_status_idx ON public.data_subject_requests USING btree (status, requested_at);

CREATE INDEX IF NOT EXISTS delivery_failures_order_idx ON public.delivery_failures USING btree (order_id);

CREATE INDEX IF NOT EXISTS delivery_failures_store_idx ON public.delivery_failures USING btree (store_id);

CREATE INDEX IF NOT EXISTS delivery_failures_unresolved_idx ON public.delivery_failures USING btree (resolved_at) WHERE (resolved_at IS NULL);

CREATE UNIQUE INDEX IF NOT EXISTS discuser_store_email_key ON public.discuser USING btree (store_id, email);

CREATE INDEX IF NOT EXISTS discuser_store_idx ON public.discuser USING btree (store_id);

CREATE INDEX IF NOT EXISTS email_codes_store_idx ON public.email_codes USING btree (store_id);

CREATE INDEX IF NOT EXISTS email_verification_store_idx ON public.email_verification USING btree (store_id);

CREATE UNIQUE INDEX IF NOT EXISTS googleuser_store_email_key ON public.googleuser USING btree (store_id, email);

CREATE INDEX IF NOT EXISTS googleuser_store_idx ON public.googleuser USING btree (store_id);

CREATE INDEX IF NOT EXISTS home_banners_store_idx ON public.home_banners USING btree (store_id);

CREATE INDEX IF NOT EXISTS idx_cart_user_id ON public.cart_items USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_categories_position ON public.categories USING btree ("position");

CREATE INDEX IF NOT EXISTS idx_categories_slug ON public.categories USING btree (slug);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_email ON public.chat_conversations USING btree (customer_email);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_order ON public.chat_conversations USING btree (order_id);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_status ON public.chat_conversations USING btree (status, last_message_at);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON public.chat_messages USING btree (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_discuser_user_id ON public.discuser USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_email_verification_email ON public.email_verification USING btree (email);

CREATE INDEX IF NOT EXISTS idx_googleuser_user_id ON public.googleuser USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_home_banners_active_position ON public.home_banners USING btree (active, "position");

CREATE INDEX IF NOT EXISTS idx_login_tokens_token_hash ON public.logintoken USING btree (token_hash);

CREATE INDEX IF NOT EXISTS idx_login_tokens_user_id ON public.logintoken USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_logintoken_userid ON public.logintoken USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items USING btree (order_id);

CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items USING btree (product_id);

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders USING btree (created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_payment_ref ON public.orders USING btree (payment_ref) WHERE (payment_ref IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders USING btree (status);

CREATE INDEX IF NOT EXISTS idx_payment_tx_order ON public.payment_transactions USING btree (order_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_tx_provider_txid ON public.payment_transactions USING btree (provider, provider_txid) WHERE (provider_txid IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON public.product_images USING btree (product_id);

CREATE INDEX IF NOT EXISTS idx_product_images_product_position ON public.product_images USING btree (product_id, "position");

CREATE INDEX IF NOT EXISTS idx_products_category ON public.products USING btree (category_id);

CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products USING btree (category_id);

CREATE INDEX IF NOT EXISTS idx_products_position ON public.products USING btree ("position");

CREATE INDEX IF NOT EXISTS idx_products_product_type ON public.products USING btree (product_type);

CREATE INDEX IF NOT EXISTS idx_products_slug ON public.products USING btree (slug);

CREATE INDEX IF NOT EXISTS idx_shipments_order ON public.shipments USING btree (order_id);

CREATE INDEX IF NOT EXISTS idx_shipments_status ON public.shipments USING btree (status);

CREATE INDEX IF NOT EXISTS idx_shipping_addresses_user ON public.shipping_addresses USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_shipping_quotes_order ON public.shipping_quotes USING btree (order_id);

CREATE INDEX IF NOT EXISTS idx_variations_product ON public.product_variations USING btree (product_id);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_created_at ON public.wallet_ledger USING btree (created_at);

CREATE INDEX IF NOT EXISTS logintoken_store_idx ON public.logintoken USING btree (store_id);

CREATE UNIQUE INDEX IF NOT EXISTS melhor_envio_credentials_one_per_store ON public.melhor_envio_credentials USING btree (store_id);

CREATE INDEX IF NOT EXISTS melhor_envio_credentials_store_idx ON public.melhor_envio_credentials USING btree (store_id);

CREATE UNIQUE INDEX IF NOT EXISTS mercadopago_credentials_one_per_store ON public.mercadopago_credentials USING btree (store_id);

CREATE INDEX IF NOT EXISTS mercadopago_credentials_store_idx ON public.mercadopago_credentials USING btree (store_id);

CREATE INDEX IF NOT EXISTS notifications_store_idx ON public.notifications USING btree (store_id);

CREATE INDEX IF NOT EXISTS notifications_unread_idx ON public.notifications USING btree (user_id) WHERE (read_at IS NULL);

CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications USING btree (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS order_items_store_idx ON public.order_items USING btree (store_id);

CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number_idx ON public.orders USING btree (order_number) WHERE (order_number IS NOT NULL);

CREATE INDEX IF NOT EXISTS orders_store_idx ON public.orders USING btree (store_id);

CREATE INDEX IF NOT EXISTS page_views_store_idx ON public.page_views USING btree (store_id);

CREATE INDEX IF NOT EXISTS payment_transactions_store_idx ON public.payment_transactions USING btree (store_id);

CREATE INDEX IF NOT EXISTS product_images_store_idx ON public.product_images USING btree (store_id);

CREATE INDEX IF NOT EXISTS product_question_messages_q_idx ON public.product_question_messages USING btree (question_id, created_at);

CREATE INDEX IF NOT EXISTS product_question_messages_store_idx ON public.product_question_messages USING btree (store_id);

CREATE INDEX IF NOT EXISTS product_questions_product_idx ON public.product_questions USING btree (product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS product_questions_staff_unread_idx ON public.product_questions USING btree (created_at) WHERE (staff_unread = true);

CREATE INDEX IF NOT EXISTS product_questions_store_idx ON public.product_questions USING btree (store_id);

CREATE INDEX IF NOT EXISTS product_questions_unanswered_idx ON public.product_questions USING btree (created_at) WHERE ((answer IS NULL) AND (hidden = false));

CREATE INDEX IF NOT EXISTS product_reviews_product_idx ON public.product_reviews USING btree (product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS product_reviews_store_idx ON public.product_reviews USING btree (store_id);

CREATE UNIQUE INDEX IF NOT EXISTS product_reviews_user_product_idx ON public.product_reviews USING btree (user_id, product_id) WHERE (user_id IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS product_variations_product_position_unique ON public.product_variations USING btree (product_id, "position");

CREATE INDEX IF NOT EXISTS product_variations_store_idx ON public.product_variations USING btree (store_id);

CREATE INDEX IF NOT EXISTS products_store_idx ON public.products USING btree (store_id);

CREATE UNIQUE INDEX IF NOT EXISTS products_store_slug_key ON public.products USING btree (store_id, slug);

CREATE UNIQUE INDEX IF NOT EXISTS reseller_commissions_order_item_idx ON public.reseller_commissions USING btree (order_item_id) WHERE (order_item_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS reseller_commissions_reseller_idx ON public.reseller_commissions USING btree (reseller_id);

CREATE INDEX IF NOT EXISTS reseller_commissions_store_idx ON public.reseller_commissions USING btree (store_id);

CREATE INDEX IF NOT EXISTS reseller_payout_requests_reseller_idx ON public.reseller_payout_requests USING btree (reseller_id);

CREATE INDEX IF NOT EXISTS reseller_payout_requests_store_idx ON public.reseller_payout_requests USING btree (store_id);

CREATE INDEX IF NOT EXISTS reseller_products_store_idx ON public.reseller_products USING btree (store_id);

CREATE INDEX IF NOT EXISTS resellers_store_idx ON public.resellers USING btree (store_id);

CREATE UNIQUE INDEX IF NOT EXISTS resellers_store_referral_key ON public.resellers USING btree (store_id, referral_code);

CREATE UNIQUE INDEX IF NOT EXISTS resellers_user_id_idx ON public.resellers USING btree (user_id);

CREATE INDEX IF NOT EXISTS shipment_events_shipment_id_idx ON public.shipment_events USING btree (shipment_id, created_at);

CREATE INDEX IF NOT EXISTS shipment_events_store_idx ON public.shipment_events USING btree (store_id);

CREATE INDEX IF NOT EXISTS shipments_store_idx ON public.shipments USING btree (store_id);

CREATE INDEX IF NOT EXISTS shipping_addresses_store_idx ON public.shipping_addresses USING btree (store_id);

CREATE INDEX IF NOT EXISTS shipping_quotes_store_idx ON public.shipping_quotes USING btree (store_id);

CREATE INDEX IF NOT EXISTS stock_keys_store_idx ON public.stock_keys USING btree (store_id);

CREATE INDEX IF NOT EXISTS stock_movements_created_idx ON public.stock_movements USING btree (created_at DESC);

CREATE INDEX IF NOT EXISTS stock_movements_order_idx ON public.stock_movements USING btree (order_id);

CREATE INDEX IF NOT EXISTS stock_movements_product_idx ON public.stock_movements USING btree (product_id);

CREATE INDEX IF NOT EXISTS stock_movements_store_idx ON public.stock_movements USING btree (store_id);

CREATE UNIQUE INDEX IF NOT EXISTS store_promotion_settings_one_per_store ON public.store_promotion_settings USING btree (store_id);

CREATE INDEX IF NOT EXISTS store_promotion_settings_store_idx ON public.store_promotion_settings USING btree (store_id);

CREATE UNIQUE INDEX IF NOT EXISTS store_settings_one_per_store ON public.store_settings USING btree (store_id);

CREATE INDEX IF NOT EXISTS store_settings_store_idx ON public.store_settings USING btree (store_id);

CREATE UNIQUE INDEX IF NOT EXISTS stores_custom_domain_key ON public.stores USING btree (lower(custom_domain)) WHERE (custom_domain IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS stores_slug_key ON public.stores USING btree (lower(slug));

CREATE INDEX IF NOT EXISTS team_audit_created_idx ON public.team_audit_log USING btree (created_at DESC);

CREATE INDEX IF NOT EXISTS team_audit_log_store_idx ON public.team_audit_log USING btree (store_id);

CREATE INDEX IF NOT EXISTS team_base_permissions_store_idx ON public.team_base_permissions USING btree (store_id);

CREATE INDEX IF NOT EXISTS team_roles_store_idx ON public.team_roles USING btree (store_id);

CREATE UNIQUE INDEX IF NOT EXISTS team_roles_store_name_key ON public.team_roles USING btree (store_id, name);

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_images_product_position ON public.product_images USING btree (product_id, "position");

CREATE UNIQUE INDEX IF NOT EXISTS users_store_email_key ON public.users USING btree (store_id, email);

CREATE INDEX IF NOT EXISTS users_store_idx ON public.users USING btree (store_id);

CREATE OR REPLACE TRIGGER trg_same_store_admin_id BEFORE INSERT OR UPDATE OF admin_id, store_id ON public.admin_roles FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('admin_id', 'admin');

CREATE OR REPLACE TRIGGER trg_same_store_carrier_id BEFORE INSERT OR UPDATE OF carrier_id, store_id ON public.shipments FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('carrier_id', 'carriers');

CREATE OR REPLACE TRIGGER trg_same_store_carrier_id BEFORE INSERT OR UPDATE OF carrier_id, store_id ON public.shipping_quotes FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('carrier_id', 'carriers');

CREATE OR REPLACE TRIGGER trg_same_store_category_id BEFORE INSERT OR UPDATE OF category_id, store_id ON public.products FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('category_id', 'categories');

CREATE OR REPLACE TRIGGER trg_same_store_conversation_id BEFORE INSERT OR UPDATE OF conversation_id, store_id ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('conversation_id', 'chat_conversations');

CREATE OR REPLACE TRIGGER trg_same_store_coupon_id BEFORE INSERT OR UPDATE OF coupon_id, store_id ON public.orders FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('coupon_id', 'coupons');

CREATE OR REPLACE TRIGGER trg_same_store_order_id BEFORE INSERT OR UPDATE OF order_id, store_id ON public.chat_conversations FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('order_id', 'orders');

CREATE OR REPLACE TRIGGER trg_same_store_order_id BEFORE INSERT OR UPDATE OF order_id, store_id ON public.delivery_failures FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('order_id', 'orders');

CREATE OR REPLACE TRIGGER trg_same_store_order_id BEFORE INSERT OR UPDATE OF order_id, store_id ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('order_id', 'orders');

CREATE OR REPLACE TRIGGER trg_same_store_order_id BEFORE INSERT OR UPDATE OF order_id, store_id ON public.payment_transactions FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('order_id', 'orders');

CREATE OR REPLACE TRIGGER trg_same_store_order_id BEFORE INSERT OR UPDATE OF order_id, store_id ON public.reseller_commissions FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('order_id', 'orders');

CREATE OR REPLACE TRIGGER trg_same_store_order_id BEFORE INSERT OR UPDATE OF order_id, store_id ON public.shipments FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('order_id', 'orders');

CREATE OR REPLACE TRIGGER trg_same_store_order_id BEFORE INSERT OR UPDATE OF order_id, store_id ON public.shipping_quotes FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('order_id', 'orders');

CREATE OR REPLACE TRIGGER trg_same_store_order_id BEFORE INSERT OR UPDATE OF order_id, store_id ON public.stock_keys FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('order_id', 'orders');

CREATE OR REPLACE TRIGGER trg_same_store_order_id BEFORE INSERT OR UPDATE OF order_id, store_id ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('order_id', 'orders');

CREATE OR REPLACE TRIGGER trg_same_store_product_id BEFORE INSERT OR UPDATE OF product_id, store_id ON public.cart_items FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('product_id', 'products');

CREATE OR REPLACE TRIGGER trg_same_store_product_id BEFORE INSERT OR UPDATE OF product_id, store_id ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('product_id', 'products');

CREATE OR REPLACE TRIGGER trg_same_store_product_id BEFORE INSERT OR UPDATE OF product_id, store_id ON public.product_images FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('product_id', 'products');

CREATE OR REPLACE TRIGGER trg_same_store_product_id BEFORE INSERT OR UPDATE OF product_id, store_id ON public.product_questions FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('product_id', 'products');

CREATE OR REPLACE TRIGGER trg_same_store_product_id BEFORE INSERT OR UPDATE OF product_id, store_id ON public.product_reviews FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('product_id', 'products');

CREATE OR REPLACE TRIGGER trg_same_store_product_id BEFORE INSERT OR UPDATE OF product_id, store_id ON public.product_variations FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('product_id', 'products');

CREATE OR REPLACE TRIGGER trg_same_store_product_id BEFORE INSERT OR UPDATE OF product_id, store_id ON public.reseller_commissions FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('product_id', 'products');

CREATE OR REPLACE TRIGGER trg_same_store_product_id BEFORE INSERT OR UPDATE OF product_id, store_id ON public.reseller_products FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('product_id', 'products');

CREATE OR REPLACE TRIGGER trg_same_store_product_id BEFORE INSERT OR UPDATE OF product_id, store_id ON public.stock_keys FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('product_id', 'products');

CREATE OR REPLACE TRIGGER trg_same_store_question_id BEFORE INSERT OR UPDATE OF question_id, store_id ON public.product_question_messages FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('question_id', 'product_questions');

CREATE OR REPLACE TRIGGER trg_same_store_reseller_id BEFORE INSERT OR UPDATE OF reseller_id, store_id ON public.orders FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('reseller_id', 'resellers');

CREATE OR REPLACE TRIGGER trg_same_store_reseller_id BEFORE INSERT OR UPDATE OF reseller_id, store_id ON public.reseller_commissions FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('reseller_id', 'resellers');

CREATE OR REPLACE TRIGGER trg_same_store_reseller_id BEFORE INSERT OR UPDATE OF reseller_id, store_id ON public.reseller_payout_requests FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('reseller_id', 'resellers');

CREATE OR REPLACE TRIGGER trg_same_store_reseller_id BEFORE INSERT OR UPDATE OF reseller_id, store_id ON public.reseller_products FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('reseller_id', 'resellers');

CREATE OR REPLACE TRIGGER trg_same_store_role_id BEFORE INSERT OR UPDATE OF role_id, store_id ON public.admin_roles FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('role_id', 'team_roles');

CREATE OR REPLACE TRIGGER trg_same_store_shipment_id BEFORE INSERT OR UPDATE OF shipment_id, store_id ON public.shipment_events FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('shipment_id', 'shipments');

CREATE OR REPLACE TRIGGER trg_same_store_shipping_address_id BEFORE INSERT OR UPDATE OF shipping_address_id, store_id ON public.orders FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('shipping_address_id', 'shipping_addresses');

CREATE OR REPLACE TRIGGER trg_same_store_user_id BEFORE INSERT OR UPDATE OF user_id, store_id ON public.cart_items FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('user_id', 'users');

CREATE OR REPLACE TRIGGER trg_same_store_user_id BEFORE INSERT OR UPDATE OF user_id, store_id ON public.discuser FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('user_id', 'users');

CREATE OR REPLACE TRIGGER trg_same_store_user_id BEFORE INSERT OR UPDATE OF user_id, store_id ON public.googleuser FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('user_id', 'users');

CREATE OR REPLACE TRIGGER trg_same_store_user_id BEFORE INSERT OR UPDATE OF user_id, store_id ON public.logintoken FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('user_id', 'users');

CREATE OR REPLACE TRIGGER trg_same_store_user_id BEFORE INSERT OR UPDATE OF user_id, store_id ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('user_id', 'users');

CREATE OR REPLACE TRIGGER trg_same_store_user_id BEFORE INSERT OR UPDATE OF user_id, store_id ON public.orders FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('user_id', 'users');

CREATE OR REPLACE TRIGGER trg_same_store_user_id BEFORE INSERT OR UPDATE OF user_id, store_id ON public.product_questions FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('user_id', 'users');

CREATE OR REPLACE TRIGGER trg_same_store_user_id BEFORE INSERT OR UPDATE OF user_id, store_id ON public.product_reviews FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('user_id', 'users');

CREATE OR REPLACE TRIGGER trg_same_store_user_id BEFORE INSERT OR UPDATE OF user_id, store_id ON public.resellers FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('user_id', 'users');

CREATE OR REPLACE TRIGGER trg_same_store_user_id BEFORE INSERT OR UPDATE OF user_id, store_id ON public.shipping_addresses FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('user_id', 'users');

CREATE OR REPLACE TRIGGER trg_same_store_variation_id BEFORE INSERT OR UPDATE OF variation_id, store_id ON public.cart_items FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('variation_id', 'product_variations');

CREATE OR REPLACE TRIGGER trg_same_store_variation_id BEFORE INSERT OR UPDATE OF variation_id, store_id ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('variation_id', 'product_variations');

CREATE OR REPLACE TRIGGER trg_same_store_variation_id BEFORE INSERT OR UPDATE OF variation_id, store_id ON public.stock_keys FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('variation_id', 'product_variations');

CREATE OR REPLACE TRIGGER trg_set_categories_position BEFORE INSERT ON public.categories FOR EACH ROW EXECUTE FUNCTION public.set_categories_position();

CREATE OR REPLACE TRIGGER trg_set_product_variation_position BEFORE INSERT ON public.product_variations FOR EACH ROW EXECUTE FUNCTION public.set_variations_position();

CREATE OR REPLACE TRIGGER trg_set_product_variation_position BEFORE INSERT ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_products_position();

CREATE OR REPLACE TRIGGER trg_set_products_position BEFORE INSERT ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_products_position();

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.admin_roles ADD CONSTRAINT admin_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.team_roles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.admin_roles ADD CONSTRAINT admin_roles_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.admin ADD CONSTRAINT admin_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.carriers ADD CONSTRAINT carriers_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.cart_items ADD CONSTRAINT cart_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.cart_items ADD CONSTRAINT cart_items_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.cart_items ADD CONSTRAINT cart_items_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.product_variations(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.categories ADD CONSTRAINT categories_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.chat_conversations ADD CONSTRAINT chat_conversations_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.chat_conversations ADD CONSTRAINT chat_conversations_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.chat_messages ADD CONSTRAINT chat_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.chat_conversations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.chat_messages ADD CONSTRAINT chat_messages_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.chat_typing ADD CONSTRAINT chat_typing_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.chat_conversations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.chat_typing ADD CONSTRAINT chat_typing_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.coupons ADD CONSTRAINT coupons_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.customer_profiles ADD CONSTRAINT customer_profiles_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.customer_profiles ADD CONSTRAINT customer_profiles_user_fk FOREIGN KEY (store_id, email) REFERENCES public.users(store_id, email) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.data_subject_requests ADD CONSTRAINT data_subject_requests_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.data_subject_requests ADD CONSTRAINT data_subject_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.delivery_failures ADD CONSTRAINT delivery_failures_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.delivery_failures ADD CONSTRAINT delivery_failures_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.discuser ADD CONSTRAINT discuser_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.discuser ADD CONSTRAINT discuser_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.email_codes ADD CONSTRAINT email_codes_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.email_verification ADD CONSTRAINT email_verification_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.orders ADD CONSTRAINT fk_orders_shipping_address FOREIGN KEY (shipping_address_id) REFERENCES public.shipping_addresses(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.wallet_ledger ADD CONSTRAINT fk_wallet_ledger_withdrawal_request FOREIGN KEY (withdrawal_request_id) REFERENCES public.withdrawal_requests(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.googleuser ADD CONSTRAINT googleuser_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.googleuser ADD CONSTRAINT googleuser_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.home_banners ADD CONSTRAINT home_banners_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.logintoken ADD CONSTRAINT logintoken_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.logintoken ADD CONSTRAINT logintoken_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.melhor_envio_credentials ADD CONSTRAINT melhor_envio_credentials_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.mercadopago_credentials ADD CONSTRAINT mercadopago_credentials_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.order_items ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.order_items ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.order_items ADD CONSTRAINT order_items_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.order_items ADD CONSTRAINT order_items_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.product_variations(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.orders ADD CONSTRAINT orders_coupon_id_fkey FOREIGN KEY (coupon_id) REFERENCES public.coupons(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.orders ADD CONSTRAINT orders_reseller_id_fkey FOREIGN KEY (reseller_id) REFERENCES public.resellers(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.orders ADD CONSTRAINT orders_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.orders ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.page_views ADD CONSTRAINT page_views_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.payment_transactions ADD CONSTRAINT payment_transactions_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.payment_transactions ADD CONSTRAINT payment_transactions_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.product_images ADD CONSTRAINT product_images_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.product_images ADD CONSTRAINT product_images_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.product_question_messages ADD CONSTRAINT product_question_messages_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.product_questions(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.product_question_messages ADD CONSTRAINT product_question_messages_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.product_question_messages ADD CONSTRAINT product_question_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.product_questions ADD CONSTRAINT product_questions_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.product_questions ADD CONSTRAINT product_questions_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.product_questions ADD CONSTRAINT product_questions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.product_reviews ADD CONSTRAINT product_reviews_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.product_reviews ADD CONSTRAINT product_reviews_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.product_reviews ADD CONSTRAINT product_reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.product_variations ADD CONSTRAINT product_variations_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.product_variations ADD CONSTRAINT product_variations_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.products ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.products ADD CONSTRAINT products_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.reseller_commissions ADD CONSTRAINT reseller_commissions_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.reseller_commissions ADD CONSTRAINT reseller_commissions_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.reseller_commissions ADD CONSTRAINT reseller_commissions_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.reseller_commissions ADD CONSTRAINT reseller_commissions_reseller_id_fkey FOREIGN KEY (reseller_id) REFERENCES public.resellers(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.reseller_commissions ADD CONSTRAINT reseller_commissions_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.reseller_payout_requests ADD CONSTRAINT reseller_payout_requests_reseller_id_fkey FOREIGN KEY (reseller_id) REFERENCES public.resellers(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.reseller_payout_requests ADD CONSTRAINT reseller_payout_requests_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.reseller_products ADD CONSTRAINT reseller_products_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.reseller_products ADD CONSTRAINT reseller_products_reseller_id_fkey FOREIGN KEY (reseller_id) REFERENCES public.resellers(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.reseller_products ADD CONSTRAINT reseller_products_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.resellers ADD CONSTRAINT resellers_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.resellers ADD CONSTRAINT resellers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.shipment_events ADD CONSTRAINT shipment_events_shipment_id_fkey FOREIGN KEY (shipment_id) REFERENCES public.shipments(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.shipment_events ADD CONSTRAINT shipment_events_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.shipments ADD CONSTRAINT shipments_carrier_id_fkey FOREIGN KEY (carrier_id) REFERENCES public.carriers(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.shipments ADD CONSTRAINT shipments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.shipments ADD CONSTRAINT shipments_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.shipping_addresses ADD CONSTRAINT shipping_addresses_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.shipping_addresses ADD CONSTRAINT shipping_addresses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.shipping_quotes ADD CONSTRAINT shipping_quotes_carrier_id_fkey FOREIGN KEY (carrier_id) REFERENCES public.carriers(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.shipping_quotes ADD CONSTRAINT shipping_quotes_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.shipping_quotes ADD CONSTRAINT shipping_quotes_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.stock_keys ADD CONSTRAINT stock_keys_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.stock_keys ADD CONSTRAINT stock_keys_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.stock_keys ADD CONSTRAINT stock_keys_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.product_variations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.stock_movements ADD CONSTRAINT stock_movements_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.stock_movements ADD CONSTRAINT stock_movements_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.stock_movements ADD CONSTRAINT stock_movements_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.stock_movements ADD CONSTRAINT stock_movements_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.product_variations(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.store_promotion_settings ADD CONSTRAINT store_promotion_settings_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.store_settings ADD CONSTRAINT store_settings_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.team_audit_log ADD CONSTRAINT team_audit_log_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.team_base_permissions ADD CONSTRAINT team_base_permissions_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.team_roles ADD CONSTRAINT team_roles_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.users ADD CONSTRAINT users_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.wallet_ledger ADD CONSTRAINT wallet_ledger_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.wishlist_items ADD CONSTRAINT wishlist_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.wishlist_items ADD CONSTRAINT wishlist_items_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.wishlist_items ADD CONSTRAINT wishlist_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.withdrawal_requests ADD CONSTRAINT withdrawal_requests_processed_by_admin_id_fkey FOREIGN KEY (processed_by_admin_id) REFERENCES public.admin(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.withdrawal_requests ADD CONSTRAINT withdrawal_requests_processed_by_dev_id_fkey FOREIGN KEY (processed_by_dev_id) REFERENCES public.dev_users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

DO $CONS$ BEGIN
  ALTER TABLE ONLY public.withdrawal_requests ADD CONSTRAINT withdrawal_requests_requested_by_admin_id_fkey FOREIGN KEY (requested_by_admin_id) REFERENCES public.admin(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $CONS$;

ALTER TABLE public.admin ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.carriers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.chat_typing ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.data_subject_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.delivery_failures ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.discuser ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.email_codes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.email_verification ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.googleuser ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.home_banners ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.logintoken ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.melhor_envio_credentials ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.mercadopago_credentials ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.product_question_messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.product_questions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.product_variations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.reseller_commissions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.reseller_payout_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.reseller_products ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.resellers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.shipment_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.shipping_addresses ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.shipping_quotes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.stock_keys ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.store_promotion_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.store_settings_old_rows ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.team_audit_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.team_base_permissions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.team_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON public.admin;
CREATE POLICY tenant_isolation ON public.admin USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.admin_roles;
CREATE POLICY tenant_isolation ON public.admin_roles USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.carriers;
CREATE POLICY tenant_isolation ON public.carriers USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.cart_items;
CREATE POLICY tenant_isolation ON public.cart_items USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.categories;
CREATE POLICY tenant_isolation ON public.categories USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.chat_conversations;
CREATE POLICY tenant_isolation ON public.chat_conversations USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.chat_messages;
CREATE POLICY tenant_isolation ON public.chat_messages USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.chat_typing;
CREATE POLICY tenant_isolation ON public.chat_typing USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.coupons;
CREATE POLICY tenant_isolation ON public.coupons USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.customer_profiles;
CREATE POLICY tenant_isolation ON public.customer_profiles USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.data_subject_requests;
CREATE POLICY tenant_isolation ON public.data_subject_requests USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.delivery_failures;
CREATE POLICY tenant_isolation ON public.delivery_failures USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.discuser;
CREATE POLICY tenant_isolation ON public.discuser USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.email_codes;
CREATE POLICY tenant_isolation ON public.email_codes USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.email_verification;
CREATE POLICY tenant_isolation ON public.email_verification USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.googleuser;
CREATE POLICY tenant_isolation ON public.googleuser USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.home_banners;
CREATE POLICY tenant_isolation ON public.home_banners USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.logintoken;
CREATE POLICY tenant_isolation ON public.logintoken USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.melhor_envio_credentials;
CREATE POLICY tenant_isolation ON public.melhor_envio_credentials USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.mercadopago_credentials;
CREATE POLICY tenant_isolation ON public.mercadopago_credentials USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.notifications;
CREATE POLICY tenant_isolation ON public.notifications USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.order_items;
CREATE POLICY tenant_isolation ON public.order_items USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.orders;
CREATE POLICY tenant_isolation ON public.orders USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.page_views;
CREATE POLICY tenant_isolation ON public.page_views USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.payment_transactions;
CREATE POLICY tenant_isolation ON public.payment_transactions USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.product_images;
CREATE POLICY tenant_isolation ON public.product_images USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.product_question_messages;
CREATE POLICY tenant_isolation ON public.product_question_messages USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.product_questions;
CREATE POLICY tenant_isolation ON public.product_questions USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.product_reviews;
CREATE POLICY tenant_isolation ON public.product_reviews USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.product_variations;
CREATE POLICY tenant_isolation ON public.product_variations USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.products;
CREATE POLICY tenant_isolation ON public.products USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.reseller_commissions;
CREATE POLICY tenant_isolation ON public.reseller_commissions USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.reseller_payout_requests;
CREATE POLICY tenant_isolation ON public.reseller_payout_requests USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.reseller_products;
CREATE POLICY tenant_isolation ON public.reseller_products USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.resellers;
CREATE POLICY tenant_isolation ON public.resellers USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.shipment_events;
CREATE POLICY tenant_isolation ON public.shipment_events USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.shipments;
CREATE POLICY tenant_isolation ON public.shipments USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.shipping_addresses;
CREATE POLICY tenant_isolation ON public.shipping_addresses USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.shipping_quotes;
CREATE POLICY tenant_isolation ON public.shipping_quotes USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.stock_keys;
CREATE POLICY tenant_isolation ON public.stock_keys USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.stock_movements;
CREATE POLICY tenant_isolation ON public.stock_movements USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.store_promotion_settings;
CREATE POLICY tenant_isolation ON public.store_promotion_settings USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.store_settings;
CREATE POLICY tenant_isolation ON public.store_settings USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.store_settings_old_rows;
CREATE POLICY tenant_isolation ON public.store_settings_old_rows USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.team_audit_log;
CREATE POLICY tenant_isolation ON public.team_audit_log USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.team_base_permissions;
CREATE POLICY tenant_isolation ON public.team_base_permissions USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.team_roles;
CREATE POLICY tenant_isolation ON public.team_roles USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.users;
CREATE POLICY tenant_isolation ON public.users USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

DROP POLICY IF EXISTS tenant_isolation ON public.wishlist_items;
CREATE POLICY tenant_isolation ON public.wishlist_items USING ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer)) WITH CHECK ((store_id = (NULLIF(current_setting('app.store_id'::text, true), ''::text))::integer));

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;

SET search_path = public;

SET row_security = on;

SET app.store_id = '1';

INSERT INTO stores (id, slug, name) VALUES (1, 'principal', 'Loja principal') ON CONFLICT (id) DO NOTHING;
SELECT setval(pg_get_serial_sequence('stores', 'id'), GREATEST(1, (SELECT MAX(id) FROM stores)));

INSERT INTO store_settings (store_id, background_style, primary_color)
SELECT 1, 'lines', '#b700ff'
WHERE NOT EXISTS (SELECT 1 FROM store_settings WHERE store_id = 1);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN PASSWORD 'TROQUE-ESTA-SENHA' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

DO $$
DECLARE r record;
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO app_user', current_database());
  GRANT USAGE, CREATE ON SCHEMA public TO app_user;

  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO app_user', r.tablename);
  END LOOP;
  FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER SEQUENCE public.%I OWNER TO app_user', r.sequencename);
  END LOOP;
  FOR r IN SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
           WHERE n.nspname = 'public' AND t.typtype = 'e' LOOP
    EXECUTE format('ALTER TYPE public.%I OWNER TO app_user', r.typname);
  END LOOP;
  FOR r IN SELECT p.oid::regprocedure AS fn FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.prokind = 'f'
             AND NOT EXISTS (
               SELECT 1 FROM pg_depend d
               WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'
             ) LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO app_user', r.fn);
  END LOOP;
END $$;

-- Item C3: condicional de propósito — em bancos onde quem roda este
-- arquivo não é superuser (ex: app_user, mesma limitação encontrada no
-- item de backup), CREATE EXTENSION falha com insufficient_privilege.
-- Em vez de abortar o resto do script (ou travar o deploy inteiro por
-- causa de um índice de performance), avisa e segue — os dois índices
-- ficam pra depois, quando alguém com privilégio rodar
-- db/migrations/2026-10-28_products_search_trgm.sql (ou este arquivo de
-- novo) separadamente.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'pg_trgm não pôde ser criada (privilégio insuficiente) — índices de busca (idx_products_name_trgm, idx_products_description_trgm) NÃO foram criados agora. Rode como superuser depois.';
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin (name gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_products_description_trgm ON products USING gin (description gin_trgm_ops);
  END IF;
END $$;
