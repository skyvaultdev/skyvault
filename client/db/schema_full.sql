-- =====================================================================
-- SCHEMA COMPLETO (banco NOVO e VAZIO) — multi-loja pronto
--
-- Gerado a partir do banco real (estrutura, sem dados), já com:
--   * todas as tabelas, inclusive as que o app criava sob demanda
--     (equipe, notificações, perguntas, avaliações, revendedores...);
--   * a fase 1 multi-loja (stores, store_id, UNIQUEs por loja, triggers);
--   * a fase 2 (DEFAULT store_id da conexão + RLS) no final.
--
-- USO: crie um banco vazio, conecte nele e rode ESTE arquivo inteiro, uma vez.
-- NÃO rode num banco que já tem tabelas (use as migrations em db/migrations).
--
-- Depois: 2026-09-25_multi_tenant_phase2b_app_role.sql (role do app sem
-- BYPASSRLS) e aponte DB_USER/DB_PASSWORD/DB_NAME do .env para o banco novo.
-- =====================================================================

--
-- PostgreSQL database dump
--


-- Dumped from database version 18.1
-- Dumped by pg_dump version 18.1

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

--
-- Name: citext; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;


--
-- Name: product_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.product_kind AS ENUM (
    'digital',
    'physical'
);


--
-- Name: shipment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.shipment_status AS ENUM (
    'preparing',
    'posted',
    'in_transit',
    'delivered',
    'returned',
    'cancelled'
);


--
-- Name: stock_delivery_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.stock_delivery_type AS ENUM (
    'key',
    'file',
    'infinite'
);


--
-- Name: enforce_same_store(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_same_store() RETURNS trigger
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


--
-- Name: set_categories_position(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_categories_position() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
IF NEW.position IS NULL THEN
SELECT COALESCE(MAX(position), 0) + 1
INTO NEW.position
FROM categories;
END IF;
RETURN NEW;
END;
$$;


--
-- Name: set_product_variation_position(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_product_variation_position() RETURNS trigger
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


--
-- Name: set_products_position(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_products_position() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.position IS NULL THEN
    SELECT COALESCE(MAX(position), 0) + 1
    INTO NEW.position
    FROM products;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: set_variations_position(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_variations_position() RETURNS trigger
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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin (
    id integer NOT NULL,
    email character varying(500) NOT NULL,
    role text DEFAULT 'admin'::text NOT NULL,
    blocked boolean DEFAULT false NOT NULL,
    store_id integer DEFAULT 1 NOT NULL,
    CONSTRAINT admin_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text, 'member'::text])))
);


--
-- Name: admin_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.admin_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: admin_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.admin_id_seq OWNED BY public.admin.id;


--
-- Name: admin_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_roles (
    admin_id integer NOT NULL,
    role_id integer NOT NULL,
    store_id integer DEFAULT 1 NOT NULL
);


--
-- Name: banners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.banners (
    id bigint NOT NULL,
    title text NOT NULL,
    subtitle text,
    image_url text NOT NULL,
    link text,
    "position" integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: banners_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.banners ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.banners_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: carriers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.carriers (
    id bigint NOT NULL,
    name text NOT NULL,
    service_code text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    melhor_envio_service_id integer,
    store_id integer DEFAULT 1 NOT NULL
);


--
-- Name: carriers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.carriers ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.carriers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: cart_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cart_items (
    id integer NOT NULL,
    user_id integer NOT NULL,
    product_id integer NOT NULL,
    variation_id integer,
    quantity integer DEFAULT 1 NOT NULL,
    added_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    store_id integer DEFAULT 1 NOT NULL,
    CONSTRAINT cart_items_quantity_check CHECK ((quantity > 0))
);


--
-- Name: cart_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cart_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cart_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cart_items_id_seq OWNED BY public.cart_items.id;


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id bigint NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    image_url text,
    "position" integer,
    store_id integer DEFAULT 1 NOT NULL
);


--
-- Name: categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.categories ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.categories_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: chat_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_conversations (
    id bigint NOT NULL,
    customer_email public.citext NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    assigned_admin_email public.citext,
    last_message_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    order_id bigint,
    is_ticket boolean DEFAULT false NOT NULL,
    store_id integer DEFAULT 1 NOT NULL
);


--
-- Name: chat_conversations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.chat_conversations ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.chat_conversations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
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
    store_id integer DEFAULT 1 NOT NULL,
    CONSTRAINT chat_messages_sender_type_check CHECK ((sender_type = ANY (ARRAY['customer'::text, 'staff'::text])))
);


--
-- Name: chat_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.chat_messages ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.chat_messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: chat_typing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_typing (
    conversation_id bigint NOT NULL,
    sender_type text NOT NULL,
    sender_email public.citext NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id integer DEFAULT 1 NOT NULL,
    CONSTRAINT chat_typing_sender_type_check CHECK ((sender_type = ANY (ARRAY['customer'::text, 'staff'::text])))
);


--
-- Name: coupons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coupons (
    id bigint NOT NULL,
    code text NOT NULL,
    percent_off numeric(5,2) NOT NULL,
    usage_limit integer DEFAULT 0 NOT NULL,
    used_count integer DEFAULT 0 NOT NULL,
    min_order_value numeric(10,2),
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    store_id integer DEFAULT 1 NOT NULL,
    CONSTRAINT coupons_percent_off_check CHECK (((percent_off >= (0)::numeric) AND (percent_off <= (100)::numeric)))
);


--
-- Name: coupons_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.coupons ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.coupons_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: customer_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_profiles (
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
    store_id integer DEFAULT 1 NOT NULL
);


--
-- Name: delivery_failures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delivery_failures (
    id integer NOT NULL,
    order_id integer,
    stage text NOT NULL,
    error_message text,
    resolved_at timestamp with time zone,
    resolved_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id integer DEFAULT 1 NOT NULL
);


--
-- Name: delivery_failures_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.delivery_failures_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: delivery_failures_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.delivery_failures_id_seq OWNED BY public.delivery_failures.id;


--
-- Name: dev_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dev_users (
    id bigint NOT NULL,
    email public.citext NOT NULL,
    password_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: dev_users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.dev_users ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.dev_users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: discuser; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discuser (
    id integer NOT NULL,
    username text NOT NULL,
    email public.citext NOT NULL,
    access_token text NOT NULL,
    refresh_token text NOT NULL,
    expires_in public.citext NOT NULL,
    user_id bigint,
    store_id integer DEFAULT 1 NOT NULL
);


--
-- Name: discuser_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.discuser_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: discuser_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.discuser_id_seq OWNED BY public.discuser.id;


--
-- Name: email_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_codes (
    email text NOT NULL,
    code_hash text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    store_id integer DEFAULT 1 NOT NULL
);


--
-- Name: email_verification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_verification (
    id integer NOT NULL,
    email text NOT NULL,
    code_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    store_id integer DEFAULT 1 NOT NULL
);


--
-- Name: email_verification_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.email_verification_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: email_verification_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.email_verification_id_seq OWNED BY public.email_verification.id;


--
-- Name: googleuser; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.googleuser (
    id integer NOT NULL,
    username text,
    email public.citext,
    access_token text,
    refresh_token text,
    expires_in integer,
    user_id bigint,
    store_id integer DEFAULT 1 NOT NULL
);


--
-- Name: googleuser_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.googleuser_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: googleuser_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.googleuser_id_seq OWNED BY public.googleuser.id;


--
-- Name: home_banners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.home_banners (
    id bigint NOT NULL,
    title text NOT NULL,
    subtitle text,
    image_url text NOT NULL,
    link text,
    active boolean DEFAULT true NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    store_id integer DEFAULT 1 NOT NULL
);


--
-- Name: home_banners_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.home_banners ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.home_banners_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: logintoken; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.logintoken (
    id integer NOT NULL,
    user_id integer NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    store_id integer DEFAULT 1 NOT NULL
);


--
-- Name: logintoken_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.logintoken_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: logintoken_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.logintoken_id_seq OWNED BY public.logintoken.id;


--
-- Name: melhor_envio_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.melhor_envio_credentials (
    id bigint NOT NULL,
    access_token_encrypted text,
    sandbox boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id integer DEFAULT 1 NOT NULL
);


--
-- Name: melhor_envio_credentials_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.melhor_envio_credentials ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.melhor_envio_credentials_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: mercadopago_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mercadopago_credentials (
    id bigint NOT NULL,
    access_token_encrypted text,
    public_key text,
    webhook_secret_encrypted text,
    sandbox boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id integer DEFAULT 1 NOT NULL
);


--
-- Name: mercadopago_credentials_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.mercadopago_credentials ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.mercadopago_credentials_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id integer NOT NULL,
    user_id integer NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text,
    data jsonb,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id integer DEFAULT 1 NOT NULL
);


--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
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
    store_id integer DEFAULT 1 NOT NULL
);


--
-- Name: order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.order_items ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.order_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
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
    store_id integer DEFAULT 1 NOT NULL
);


--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.orders ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.orders_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: page_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.page_views (
    id bigint NOT NULL,
    path text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id integer DEFAULT 1 NOT NULL
);


--
-- Name: page_views_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.page_views ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.page_views_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: payment_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_transactions (
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
    store_id integer DEFAULT 1 NOT NULL,
    CONSTRAINT payment_transactions_method_check CHECK ((method = ANY (ARRAY['pix'::text, 'credit_card'::text, 'debit_card'::text, 'boleto'::text]))),
    CONSTRAINT payment_transactions_status_check CHECK ((status = ANY (ARRAY['created'::text, 'pending'::text, 'paid'::text, 'expired'::text, 'failed'::text, 'refunded'::text])))
);


--
-- Name: payment_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.payment_transactions ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.payment_transactions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: product_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_images (
    id bigint NOT NULL,
    product_id bigint NOT NULL,
    url text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id integer DEFAULT 1 NOT NULL
);


--
-- Name: product_images_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.product_images ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.product_images_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: product_question_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_question_messages (
    id integer NOT NULL,
    question_id integer NOT NULL,
    author_type text NOT NULL,
    author_name text,
    user_id integer,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id integer DEFAULT 1 NOT NULL,
    CONSTRAINT product_question_messages_author_type_check CHECK ((author_type = ANY (ARRAY['customer'::text, 'staff'::text])))
);


--
-- Name: product_question_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_question_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_question_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_question_messages_id_seq OWNED BY public.product_question_messages.id;


--
-- Name: product_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_questions (
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
    store_id integer DEFAULT 1 NOT NULL
);


--
-- Name: product_questions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_questions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_questions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_questions_id_seq OWNED BY public.product_questions.id;


--
-- Name: product_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_reviews (
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
    store_id integer DEFAULT 1 NOT NULL,
    CONSTRAINT product_reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: product_reviews_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_reviews_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_reviews_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_reviews_id_seq OWNED BY public.product_reviews.id;


--
-- Name: product_variations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_variations (
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
    store_id integer DEFAULT 1 NOT NULL
);


--
-- Name: product_variations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_variations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_variations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_variations_id_seq OWNED BY public.product_variations.id;


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
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
    store_id integer DEFAULT 1 NOT NULL
);


--
-- Name: products_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.products ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.products_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: reseller_commissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reseller_commissions (
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
    store_id integer DEFAULT 1 NOT NULL
);


--
-- Name: reseller_commissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reseller_commissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reseller_commissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reseller_commissions_id_seq OWNED BY public.reseller_commissions.id;


--
-- Name: reseller_payout_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reseller_payout_requests (
    id integer NOT NULL,
    reseller_id integer NOT NULL,
    amount numeric(10,2) NOT NULL,
    status text DEFAULT 'requested'::text NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    resolved_by text,
    note text,
    store_id integer DEFAULT 1 NOT NULL
);


--
-- Name: reseller_payout_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reseller_payout_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reseller_payout_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reseller_payout_requests_id_seq OWNED BY public.reseller_payout_requests.id;


--
-- Name: reseller_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reseller_products (
    id integer NOT NULL,
    reseller_id integer NOT NULL,
    product_id integer NOT NULL,
    commission_percent numeric(5,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id integer DEFAULT 1 NOT NULL
);


--
-- Name: reseller_products_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reseller_products_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reseller_products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reseller_products_id_seq OWNED BY public.reseller_products.id;


--
-- Name: resellers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resellers (
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
    store_id integer DEFAULT 1 NOT NULL
);


--
-- Name: resellers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.resellers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: resellers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.resellers_id_seq OWNED BY public.resellers.id;


--
-- Name: shipment_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shipment_events (
    id bigint NOT NULL,
    shipment_id bigint NOT NULL,
    status public.shipment_status NOT NULL,
    city text,
    state character(2),
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id integer DEFAULT 1 NOT NULL
);


--
-- Name: shipment_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.shipment_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.shipment_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: shipments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shipments (
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
    store_id integer DEFAULT 1 NOT NULL
);


--
-- Name: shipments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.shipments ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.shipments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: shipping_addresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shipping_addresses (
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
    store_id integer DEFAULT 1 NOT NULL
);


--
-- Name: shipping_addresses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.shipping_addresses ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.shipping_addresses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: shipping_quotes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shipping_quotes (
    id bigint NOT NULL,
    order_id bigint,
    carrier_id bigint,
    service_name text,
    price numeric(10,2) NOT NULL,
    eta_days integer,
    selected boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id integer DEFAULT 1 NOT NULL
);


--
-- Name: shipping_quotes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.shipping_quotes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.shipping_quotes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: stock_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_keys (
    id integer NOT NULL,
    product_id integer,
    variation_id integer,
    key_content text NOT NULL,
    is_sold boolean DEFAULT false,
    order_id integer,
    sold_at timestamp without time zone,
    store_id integer DEFAULT 1 NOT NULL,
    CONSTRAINT one_target CHECK ((((product_id IS NOT NULL) AND (variation_id IS NULL)) OR ((product_id IS NULL) AND (variation_id IS NOT NULL))))
);


--
-- Name: stock_keys_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_keys_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_keys_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_keys_id_seq OWNED BY public.stock_keys.id;


--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_movements (
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
    store_id integer DEFAULT 1 NOT NULL
);


--
-- Name: stock_movements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_movements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_movements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_movements_id_seq OWNED BY public.stock_movements.id;


--
-- Name: store_promotion_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_promotion_settings (
    id bigint NOT NULL,
    discount_tiers jsonb DEFAULT '[]'::jsonb NOT NULL,
    free_shipping_enabled boolean DEFAULT true NOT NULL,
    free_shipping_threshold numeric(10,2) DEFAULT 150 NOT NULL,
    min_order_value numeric(10,2) DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id integer DEFAULT 1 NOT NULL
);


--
-- Name: store_promotion_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.store_promotion_settings ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.store_promotion_settings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: store_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.store_settings (
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
    store_id integer DEFAULT 1 NOT NULL
);


--
-- Name: store_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.store_settings ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.store_settings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: stores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stores (
    id integer NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    custom_domain text,
    status text DEFAULT 'active'::text NOT NULL,
    suspended_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stores_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'disabled'::text])))
);


--
-- Name: stores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.stores ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.stores_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: team_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_audit_log (
    id integer NOT NULL,
    actor_email text NOT NULL,
    action text NOT NULL,
    target text,
    details jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id integer DEFAULT 1 NOT NULL
);


--
-- Name: team_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.team_audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: team_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.team_audit_log_id_seq OWNED BY public.team_audit_log.id;


--
-- Name: team_base_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_base_permissions (
    role text NOT NULL,
    permissions text[] DEFAULT '{}'::text[] NOT NULL,
    updated_by text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id integer DEFAULT 1 NOT NULL
);


--
-- Name: team_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_roles (
    id integer NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#99aab5'::text NOT NULL,
    "position" integer DEFAULT 1 NOT NULL,
    permissions text[] DEFAULT '{}'::text[] NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id integer DEFAULT 1 NOT NULL
);


--
-- Name: team_roles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.team_roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: team_roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.team_roles_id_seq OWNED BY public.team_roles.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    email character varying(500) NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    username text,
    store_id integer DEFAULT 1 NOT NULL
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: wallet_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wallet_ledger (
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


--
-- Name: wallet_ledger_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.wallet_ledger ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.wallet_ledger_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: withdrawal_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.withdrawal_requests (
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


--
-- Name: withdrawal_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.withdrawal_requests ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.withdrawal_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: admin id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin ALTER COLUMN id SET DEFAULT nextval('public.admin_id_seq'::regclass);


--
-- Name: cart_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items ALTER COLUMN id SET DEFAULT nextval('public.cart_items_id_seq'::regclass);


--
-- Name: delivery_failures id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_failures ALTER COLUMN id SET DEFAULT nextval('public.delivery_failures_id_seq'::regclass);


--
-- Name: discuser id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discuser ALTER COLUMN id SET DEFAULT nextval('public.discuser_id_seq'::regclass);


--
-- Name: email_verification id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification ALTER COLUMN id SET DEFAULT nextval('public.email_verification_id_seq'::regclass);


--
-- Name: googleuser id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.googleuser ALTER COLUMN id SET DEFAULT nextval('public.googleuser_id_seq'::regclass);


--
-- Name: logintoken id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logintoken ALTER COLUMN id SET DEFAULT nextval('public.logintoken_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);


--
-- Name: product_question_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_question_messages ALTER COLUMN id SET DEFAULT nextval('public.product_question_messages_id_seq'::regclass);


--
-- Name: product_questions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_questions ALTER COLUMN id SET DEFAULT nextval('public.product_questions_id_seq'::regclass);


--
-- Name: product_reviews id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews ALTER COLUMN id SET DEFAULT nextval('public.product_reviews_id_seq'::regclass);


--
-- Name: product_variations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variations ALTER COLUMN id SET DEFAULT nextval('public.product_variations_id_seq'::regclass);


--
-- Name: reseller_commissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reseller_commissions ALTER COLUMN id SET DEFAULT nextval('public.reseller_commissions_id_seq'::regclass);


--
-- Name: reseller_payout_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reseller_payout_requests ALTER COLUMN id SET DEFAULT nextval('public.reseller_payout_requests_id_seq'::regclass);


--
-- Name: reseller_products id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reseller_products ALTER COLUMN id SET DEFAULT nextval('public.reseller_products_id_seq'::regclass);


--
-- Name: resellers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resellers ALTER COLUMN id SET DEFAULT nextval('public.resellers_id_seq'::regclass);


--
-- Name: stock_keys id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_keys ALTER COLUMN id SET DEFAULT nextval('public.stock_keys_id_seq'::regclass);


--
-- Name: stock_movements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements ALTER COLUMN id SET DEFAULT nextval('public.stock_movements_id_seq'::regclass);


--
-- Name: team_audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_audit_log ALTER COLUMN id SET DEFAULT nextval('public.team_audit_log_id_seq'::regclass);


--
-- Name: team_roles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_roles ALTER COLUMN id SET DEFAULT nextval('public.team_roles_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: admin admin_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin
    ADD CONSTRAINT admin_pkey PRIMARY KEY (id);


--
-- Name: admin_roles admin_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_roles
    ADD CONSTRAINT admin_roles_pkey PRIMARY KEY (admin_id, role_id);


--
-- Name: banners banners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banners
    ADD CONSTRAINT banners_pkey PRIMARY KEY (id);


--
-- Name: carriers carriers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.carriers
    ADD CONSTRAINT carriers_pkey PRIMARY KEY (id);


--
-- Name: cart_items cart_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_pkey PRIMARY KEY (id);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: chat_conversations chat_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_conversations
    ADD CONSTRAINT chat_conversations_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: chat_typing chat_typing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_typing
    ADD CONSTRAINT chat_typing_pkey PRIMARY KEY (conversation_id, sender_email);


--
-- Name: coupons coupons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_pkey PRIMARY KEY (id);


--
-- Name: customer_profiles customer_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_profiles
    ADD CONSTRAINT customer_profiles_pkey PRIMARY KEY (store_id, email);


--
-- Name: delivery_failures delivery_failures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_failures
    ADD CONSTRAINT delivery_failures_pkey PRIMARY KEY (id);


--
-- Name: dev_users dev_users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dev_users
    ADD CONSTRAINT dev_users_email_key UNIQUE (email);


--
-- Name: dev_users dev_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dev_users
    ADD CONSTRAINT dev_users_pkey PRIMARY KEY (id);


--
-- Name: discuser discuser_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discuser
    ADD CONSTRAINT discuser_pkey PRIMARY KEY (id);


--
-- Name: email_codes email_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_codes
    ADD CONSTRAINT email_codes_pkey PRIMARY KEY (store_id, email);


--
-- Name: email_verification email_verification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification
    ADD CONSTRAINT email_verification_pkey PRIMARY KEY (id);


--
-- Name: googleuser googleuser_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.googleuser
    ADD CONSTRAINT googleuser_pkey PRIMARY KEY (id);


--
-- Name: home_banners home_banners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.home_banners
    ADD CONSTRAINT home_banners_pkey PRIMARY KEY (id);


--
-- Name: logintoken logintoken_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logintoken
    ADD CONSTRAINT logintoken_pkey PRIMARY KEY (id);


--
-- Name: melhor_envio_credentials melhor_envio_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.melhor_envio_credentials
    ADD CONSTRAINT melhor_envio_credentials_pkey PRIMARY KEY (id);


--
-- Name: mercadopago_credentials mercadopago_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mercadopago_credentials
    ADD CONSTRAINT mercadopago_credentials_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: page_views page_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_views
    ADD CONSTRAINT page_views_pkey PRIMARY KEY (id);


--
-- Name: payment_transactions payment_transactions_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: payment_transactions payment_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_pkey PRIMARY KEY (id);


--
-- Name: product_images product_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_images
    ADD CONSTRAINT product_images_pkey PRIMARY KEY (id);


--
-- Name: product_question_messages product_question_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_question_messages
    ADD CONSTRAINT product_question_messages_pkey PRIMARY KEY (id);


--
-- Name: product_questions product_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_questions
    ADD CONSTRAINT product_questions_pkey PRIMARY KEY (id);


--
-- Name: product_reviews product_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_pkey PRIMARY KEY (id);


--
-- Name: product_variations product_variations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variations
    ADD CONSTRAINT product_variations_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: reseller_commissions reseller_commissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reseller_commissions
    ADD CONSTRAINT reseller_commissions_pkey PRIMARY KEY (id);


--
-- Name: reseller_payout_requests reseller_payout_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reseller_payout_requests
    ADD CONSTRAINT reseller_payout_requests_pkey PRIMARY KEY (id);


--
-- Name: reseller_products reseller_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reseller_products
    ADD CONSTRAINT reseller_products_pkey PRIMARY KEY (id);


--
-- Name: reseller_products reseller_products_reseller_id_product_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reseller_products
    ADD CONSTRAINT reseller_products_reseller_id_product_id_key UNIQUE (reseller_id, product_id);


--
-- Name: resellers resellers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resellers
    ADD CONSTRAINT resellers_pkey PRIMARY KEY (id);


--
-- Name: shipment_events shipment_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_events
    ADD CONSTRAINT shipment_events_pkey PRIMARY KEY (id);


--
-- Name: shipments shipments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipments
    ADD CONSTRAINT shipments_pkey PRIMARY KEY (id);


--
-- Name: shipping_addresses shipping_addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_addresses
    ADD CONSTRAINT shipping_addresses_pkey PRIMARY KEY (id);


--
-- Name: shipping_quotes shipping_quotes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_quotes
    ADD CONSTRAINT shipping_quotes_pkey PRIMARY KEY (id);


--
-- Name: stock_keys stock_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_keys
    ADD CONSTRAINT stock_keys_pkey PRIMARY KEY (id);


--
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);


--
-- Name: store_promotion_settings store_promotion_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_promotion_settings
    ADD CONSTRAINT store_promotion_settings_pkey PRIMARY KEY (id);


--
-- Name: store_settings store_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_settings
    ADD CONSTRAINT store_settings_pkey PRIMARY KEY (id);


--
-- Name: stores stores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stores
    ADD CONSTRAINT stores_pkey PRIMARY KEY (id);


--
-- Name: team_audit_log team_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_audit_log
    ADD CONSTRAINT team_audit_log_pkey PRIMARY KEY (id);


--
-- Name: team_base_permissions team_base_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_base_permissions
    ADD CONSTRAINT team_base_permissions_pkey PRIMARY KEY (store_id, role);


--
-- Name: team_roles team_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_roles
    ADD CONSTRAINT team_roles_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: wallet_ledger wallet_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_ledger
    ADD CONSTRAINT wallet_ledger_pkey PRIMARY KEY (id);


--
-- Name: withdrawal_requests withdrawal_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_requests
    ADD CONSTRAINT withdrawal_requests_pkey PRIMARY KEY (id);


--
-- Name: admin_roles_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_roles_store_idx ON public.admin_roles USING btree (store_id);


--
-- Name: admin_store_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX admin_store_email_key ON public.admin USING btree (store_id, email);


--
-- Name: admin_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_store_idx ON public.admin USING btree (store_id);


--
-- Name: carriers_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX carriers_store_idx ON public.carriers USING btree (store_id);


--
-- Name: carriers_store_melhor_envio_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX carriers_store_melhor_envio_idx ON public.carriers USING btree (store_id, melhor_envio_service_id) WHERE (melhor_envio_service_id IS NOT NULL);


--
-- Name: cart_items_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cart_items_store_idx ON public.cart_items USING btree (store_id);


--
-- Name: cart_items_unique_no_variation; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cart_items_unique_no_variation ON public.cart_items USING btree (user_id, product_id) WHERE (variation_id IS NULL);


--
-- Name: cart_items_unique_with_variation; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cart_items_unique_with_variation ON public.cart_items USING btree (user_id, product_id, variation_id) WHERE (variation_id IS NOT NULL);


--
-- Name: categories_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX categories_store_idx ON public.categories USING btree (store_id);


--
-- Name: categories_store_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX categories_store_slug_key ON public.categories USING btree (store_id, slug);


--
-- Name: chat_conversations_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_conversations_store_idx ON public.chat_conversations USING btree (store_id);


--
-- Name: chat_conversations_ticket_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_conversations_ticket_idx ON public.chat_conversations USING btree (is_ticket, status);


--
-- Name: chat_messages_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_messages_store_idx ON public.chat_messages USING btree (store_id);


--
-- Name: chat_typing_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_typing_store_idx ON public.chat_typing USING btree (store_id);


--
-- Name: coupons_store_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX coupons_store_code_key ON public.coupons USING btree (store_id, code);


--
-- Name: coupons_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coupons_store_idx ON public.coupons USING btree (store_id);


--
-- Name: customer_profiles_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_profiles_store_idx ON public.customer_profiles USING btree (store_id);


--
-- Name: delivery_failures_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX delivery_failures_order_idx ON public.delivery_failures USING btree (order_id);


--
-- Name: delivery_failures_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX delivery_failures_store_idx ON public.delivery_failures USING btree (store_id);


--
-- Name: delivery_failures_unresolved_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX delivery_failures_unresolved_idx ON public.delivery_failures USING btree (resolved_at) WHERE (resolved_at IS NULL);


--
-- Name: discuser_store_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX discuser_store_email_key ON public.discuser USING btree (store_id, email);


--
-- Name: discuser_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX discuser_store_idx ON public.discuser USING btree (store_id);


--
-- Name: email_codes_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_codes_store_idx ON public.email_codes USING btree (store_id);


--
-- Name: email_verification_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_verification_store_idx ON public.email_verification USING btree (store_id);


--
-- Name: googleuser_store_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX googleuser_store_email_key ON public.googleuser USING btree (store_id, email);


--
-- Name: googleuser_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX googleuser_store_idx ON public.googleuser USING btree (store_id);


--
-- Name: home_banners_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX home_banners_store_idx ON public.home_banners USING btree (store_id);


--
-- Name: idx_cart_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cart_user_id ON public.cart_items USING btree (user_id);


--
-- Name: idx_categories_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categories_position ON public.categories USING btree ("position");


--
-- Name: idx_chat_conversations_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_conversations_email ON public.chat_conversations USING btree (customer_email);


--
-- Name: idx_chat_conversations_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_conversations_order ON public.chat_conversations USING btree (order_id);


--
-- Name: idx_chat_conversations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_conversations_status ON public.chat_conversations USING btree (status, last_message_at);


--
-- Name: idx_chat_messages_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_conversation ON public.chat_messages USING btree (conversation_id, created_at);


--
-- Name: idx_discuser_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_discuser_user_id ON public.discuser USING btree (user_id);


--
-- Name: idx_email_verification_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_verification_email ON public.email_verification USING btree (email);


--
-- Name: idx_googleuser_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_googleuser_user_id ON public.googleuser USING btree (user_id);


--
-- Name: idx_home_banners_active_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_home_banners_active_position ON public.home_banners USING btree (active, "position");


--
-- Name: idx_login_tokens_token_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_login_tokens_token_hash ON public.logintoken USING btree (token_hash);


--
-- Name: idx_login_tokens_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_login_tokens_user_id ON public.logintoken USING btree (user_id);


--
-- Name: idx_logintoken_userid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logintoken_userid ON public.logintoken USING btree (user_id);


--
-- Name: idx_order_items_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_order_id ON public.order_items USING btree (order_id);


--
-- Name: idx_order_items_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_product_id ON public.order_items USING btree (product_id);


--
-- Name: idx_orders_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_created_at ON public.orders USING btree (created_at);


--
-- Name: idx_orders_payment_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_orders_payment_ref ON public.orders USING btree (payment_ref) WHERE (payment_ref IS NOT NULL);


--
-- Name: idx_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_status ON public.orders USING btree (status);


--
-- Name: idx_payment_tx_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_tx_order ON public.payment_transactions USING btree (order_id);


--
-- Name: idx_payment_tx_provider_txid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_payment_tx_provider_txid ON public.payment_transactions USING btree (provider, provider_txid) WHERE (provider_txid IS NOT NULL);


--
-- Name: idx_product_images_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_images_product_id ON public.product_images USING btree (product_id);


--
-- Name: idx_product_images_product_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_images_product_position ON public.product_images USING btree (product_id, "position");


--
-- Name: idx_products_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_category ON public.products USING btree (category_id);


--
-- Name: idx_products_category_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_category_id ON public.products USING btree (category_id);


--
-- Name: idx_products_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_position ON public.products USING btree ("position");


--
-- Name: idx_products_product_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_product_type ON public.products USING btree (product_type);


--
-- Name: idx_products_slug_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_products_slug_unique ON public.products USING btree (slug);


--
-- Name: idx_shipments_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shipments_order ON public.shipments USING btree (order_id);


--
-- Name: idx_shipments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shipments_status ON public.shipments USING btree (status);


--
-- Name: idx_shipping_addresses_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shipping_addresses_user ON public.shipping_addresses USING btree (user_id);


--
-- Name: idx_shipping_quotes_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shipping_quotes_order ON public.shipping_quotes USING btree (order_id);


--
-- Name: idx_variations_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_variations_product ON public.product_variations USING btree (product_id);


--
-- Name: idx_wallet_ledger_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wallet_ledger_created_at ON public.wallet_ledger USING btree (created_at);


--
-- Name: logintoken_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX logintoken_store_idx ON public.logintoken USING btree (store_id);


--
-- Name: melhor_envio_credentials_one_per_store; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX melhor_envio_credentials_one_per_store ON public.melhor_envio_credentials USING btree (store_id);


--
-- Name: melhor_envio_credentials_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX melhor_envio_credentials_store_idx ON public.melhor_envio_credentials USING btree (store_id);


--
-- Name: mercadopago_credentials_one_per_store; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX mercadopago_credentials_one_per_store ON public.mercadopago_credentials USING btree (store_id);


--
-- Name: mercadopago_credentials_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mercadopago_credentials_store_idx ON public.mercadopago_credentials USING btree (store_id);


--
-- Name: notifications_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_store_idx ON public.notifications USING btree (store_id);


--
-- Name: notifications_unread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_unread_idx ON public.notifications USING btree (user_id) WHERE (read_at IS NULL);


--
-- Name: notifications_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_user_idx ON public.notifications USING btree (user_id, created_at DESC);


--
-- Name: order_items_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_items_store_idx ON public.order_items USING btree (store_id);


--
-- Name: orders_order_number_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX orders_order_number_idx ON public.orders USING btree (order_number) WHERE (order_number IS NOT NULL);


--
-- Name: orders_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_store_idx ON public.orders USING btree (store_id);


--
-- Name: page_views_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX page_views_store_idx ON public.page_views USING btree (store_id);


--
-- Name: payment_transactions_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_transactions_store_idx ON public.payment_transactions USING btree (store_id);


--
-- Name: product_images_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_images_store_idx ON public.product_images USING btree (store_id);


--
-- Name: product_question_messages_q_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_question_messages_q_idx ON public.product_question_messages USING btree (question_id, created_at);


--
-- Name: product_question_messages_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_question_messages_store_idx ON public.product_question_messages USING btree (store_id);


--
-- Name: product_questions_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_questions_product_idx ON public.product_questions USING btree (product_id, created_at DESC);


--
-- Name: product_questions_staff_unread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_questions_staff_unread_idx ON public.product_questions USING btree (created_at) WHERE (staff_unread = true);


--
-- Name: product_questions_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_questions_store_idx ON public.product_questions USING btree (store_id);


--
-- Name: product_questions_unanswered_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_questions_unanswered_idx ON public.product_questions USING btree (created_at) WHERE ((answer IS NULL) AND (hidden = false));


--
-- Name: product_reviews_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_reviews_product_idx ON public.product_reviews USING btree (product_id, created_at DESC);


--
-- Name: product_reviews_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_reviews_store_idx ON public.product_reviews USING btree (store_id);


--
-- Name: product_reviews_user_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX product_reviews_user_product_idx ON public.product_reviews USING btree (user_id, product_id) WHERE (user_id IS NOT NULL);


--
-- Name: product_variations_product_position_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX product_variations_product_position_unique ON public.product_variations USING btree (product_id, "position");


--
-- Name: product_variations_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_variations_store_idx ON public.product_variations USING btree (store_id);


--
-- Name: products_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX products_store_idx ON public.products USING btree (store_id);


--
-- Name: products_store_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX products_store_slug_key ON public.products USING btree (store_id, slug);


--
-- Name: reseller_commissions_order_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX reseller_commissions_order_item_idx ON public.reseller_commissions USING btree (order_item_id) WHERE (order_item_id IS NOT NULL);


--
-- Name: reseller_commissions_reseller_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reseller_commissions_reseller_idx ON public.reseller_commissions USING btree (reseller_id);


--
-- Name: reseller_commissions_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reseller_commissions_store_idx ON public.reseller_commissions USING btree (store_id);


--
-- Name: reseller_payout_requests_reseller_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reseller_payout_requests_reseller_idx ON public.reseller_payout_requests USING btree (reseller_id);


--
-- Name: reseller_payout_requests_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reseller_payout_requests_store_idx ON public.reseller_payout_requests USING btree (store_id);


--
-- Name: reseller_products_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reseller_products_store_idx ON public.reseller_products USING btree (store_id);


--
-- Name: resellers_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX resellers_store_idx ON public.resellers USING btree (store_id);


--
-- Name: resellers_store_referral_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX resellers_store_referral_key ON public.resellers USING btree (store_id, referral_code);


--
-- Name: resellers_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX resellers_user_id_idx ON public.resellers USING btree (user_id);


--
-- Name: shipment_events_shipment_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shipment_events_shipment_id_idx ON public.shipment_events USING btree (shipment_id, created_at);


--
-- Name: shipment_events_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shipment_events_store_idx ON public.shipment_events USING btree (store_id);


--
-- Name: shipments_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shipments_store_idx ON public.shipments USING btree (store_id);


--
-- Name: shipping_addresses_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shipping_addresses_store_idx ON public.shipping_addresses USING btree (store_id);


--
-- Name: shipping_quotes_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shipping_quotes_store_idx ON public.shipping_quotes USING btree (store_id);


--
-- Name: stock_keys_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_keys_store_idx ON public.stock_keys USING btree (store_id);


--
-- Name: stock_movements_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_movements_created_idx ON public.stock_movements USING btree (created_at DESC);


--
-- Name: stock_movements_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_movements_order_idx ON public.stock_movements USING btree (order_id);


--
-- Name: stock_movements_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_movements_product_idx ON public.stock_movements USING btree (product_id);


--
-- Name: stock_movements_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_movements_store_idx ON public.stock_movements USING btree (store_id);


--
-- Name: store_promotion_settings_one_per_store; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX store_promotion_settings_one_per_store ON public.store_promotion_settings USING btree (store_id);


--
-- Name: store_promotion_settings_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX store_promotion_settings_store_idx ON public.store_promotion_settings USING btree (store_id);


--
-- Name: store_settings_one_per_store; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX store_settings_one_per_store ON public.store_settings USING btree (store_id);


--
-- Name: store_settings_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX store_settings_store_idx ON public.store_settings USING btree (store_id);


--
-- Name: stores_custom_domain_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX stores_custom_domain_key ON public.stores USING btree (lower(custom_domain)) WHERE (custom_domain IS NOT NULL);


--
-- Name: stores_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX stores_slug_key ON public.stores USING btree (lower(slug));


--
-- Name: team_audit_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_audit_created_idx ON public.team_audit_log USING btree (created_at DESC);


--
-- Name: team_audit_log_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_audit_log_store_idx ON public.team_audit_log USING btree (store_id);


--
-- Name: team_base_permissions_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_base_permissions_store_idx ON public.team_base_permissions USING btree (store_id);


--
-- Name: team_roles_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX team_roles_store_idx ON public.team_roles USING btree (store_id);


--
-- Name: team_roles_store_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX team_roles_store_name_key ON public.team_roles USING btree (store_id, name);


--
-- Name: uq_product_images_product_position; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_product_images_product_position ON public.product_images USING btree (product_id, "position");


--
-- Name: users_store_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_store_email_key ON public.users USING btree (store_id, email);


--
-- Name: users_store_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_store_idx ON public.users USING btree (store_id);


--
-- Name: admin_roles trg_same_store_admin_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_admin_id BEFORE INSERT OR UPDATE OF admin_id, store_id ON public.admin_roles FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('admin_id', 'admin');


--
-- Name: shipments trg_same_store_carrier_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_carrier_id BEFORE INSERT OR UPDATE OF carrier_id, store_id ON public.shipments FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('carrier_id', 'carriers');


--
-- Name: shipping_quotes trg_same_store_carrier_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_carrier_id BEFORE INSERT OR UPDATE OF carrier_id, store_id ON public.shipping_quotes FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('carrier_id', 'carriers');


--
-- Name: products trg_same_store_category_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_category_id BEFORE INSERT OR UPDATE OF category_id, store_id ON public.products FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('category_id', 'categories');


--
-- Name: chat_messages trg_same_store_conversation_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_conversation_id BEFORE INSERT OR UPDATE OF conversation_id, store_id ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('conversation_id', 'chat_conversations');


--
-- Name: orders trg_same_store_coupon_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_coupon_id BEFORE INSERT OR UPDATE OF coupon_id, store_id ON public.orders FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('coupon_id', 'coupons');


--
-- Name: chat_conversations trg_same_store_order_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_order_id BEFORE INSERT OR UPDATE OF order_id, store_id ON public.chat_conversations FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('order_id', 'orders');


--
-- Name: delivery_failures trg_same_store_order_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_order_id BEFORE INSERT OR UPDATE OF order_id, store_id ON public.delivery_failures FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('order_id', 'orders');


--
-- Name: order_items trg_same_store_order_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_order_id BEFORE INSERT OR UPDATE OF order_id, store_id ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('order_id', 'orders');


--
-- Name: payment_transactions trg_same_store_order_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_order_id BEFORE INSERT OR UPDATE OF order_id, store_id ON public.payment_transactions FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('order_id', 'orders');


--
-- Name: reseller_commissions trg_same_store_order_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_order_id BEFORE INSERT OR UPDATE OF order_id, store_id ON public.reseller_commissions FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('order_id', 'orders');


--
-- Name: shipments trg_same_store_order_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_order_id BEFORE INSERT OR UPDATE OF order_id, store_id ON public.shipments FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('order_id', 'orders');


--
-- Name: shipping_quotes trg_same_store_order_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_order_id BEFORE INSERT OR UPDATE OF order_id, store_id ON public.shipping_quotes FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('order_id', 'orders');


--
-- Name: stock_keys trg_same_store_order_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_order_id BEFORE INSERT OR UPDATE OF order_id, store_id ON public.stock_keys FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('order_id', 'orders');


--
-- Name: stock_movements trg_same_store_order_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_order_id BEFORE INSERT OR UPDATE OF order_id, store_id ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('order_id', 'orders');


--
-- Name: cart_items trg_same_store_product_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_product_id BEFORE INSERT OR UPDATE OF product_id, store_id ON public.cart_items FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('product_id', 'products');


--
-- Name: order_items trg_same_store_product_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_product_id BEFORE INSERT OR UPDATE OF product_id, store_id ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('product_id', 'products');


--
-- Name: product_images trg_same_store_product_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_product_id BEFORE INSERT OR UPDATE OF product_id, store_id ON public.product_images FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('product_id', 'products');


--
-- Name: product_questions trg_same_store_product_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_product_id BEFORE INSERT OR UPDATE OF product_id, store_id ON public.product_questions FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('product_id', 'products');


--
-- Name: product_reviews trg_same_store_product_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_product_id BEFORE INSERT OR UPDATE OF product_id, store_id ON public.product_reviews FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('product_id', 'products');


--
-- Name: product_variations trg_same_store_product_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_product_id BEFORE INSERT OR UPDATE OF product_id, store_id ON public.product_variations FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('product_id', 'products');


--
-- Name: reseller_commissions trg_same_store_product_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_product_id BEFORE INSERT OR UPDATE OF product_id, store_id ON public.reseller_commissions FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('product_id', 'products');


--
-- Name: reseller_products trg_same_store_product_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_product_id BEFORE INSERT OR UPDATE OF product_id, store_id ON public.reseller_products FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('product_id', 'products');


--
-- Name: stock_keys trg_same_store_product_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_product_id BEFORE INSERT OR UPDATE OF product_id, store_id ON public.stock_keys FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('product_id', 'products');


--
-- Name: product_question_messages trg_same_store_question_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_question_id BEFORE INSERT OR UPDATE OF question_id, store_id ON public.product_question_messages FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('question_id', 'product_questions');


--
-- Name: orders trg_same_store_reseller_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_reseller_id BEFORE INSERT OR UPDATE OF reseller_id, store_id ON public.orders FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('reseller_id', 'resellers');


--
-- Name: reseller_commissions trg_same_store_reseller_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_reseller_id BEFORE INSERT OR UPDATE OF reseller_id, store_id ON public.reseller_commissions FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('reseller_id', 'resellers');


--
-- Name: reseller_payout_requests trg_same_store_reseller_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_reseller_id BEFORE INSERT OR UPDATE OF reseller_id, store_id ON public.reseller_payout_requests FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('reseller_id', 'resellers');


--
-- Name: reseller_products trg_same_store_reseller_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_reseller_id BEFORE INSERT OR UPDATE OF reseller_id, store_id ON public.reseller_products FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('reseller_id', 'resellers');


--
-- Name: admin_roles trg_same_store_role_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_role_id BEFORE INSERT OR UPDATE OF role_id, store_id ON public.admin_roles FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('role_id', 'team_roles');


--
-- Name: shipment_events trg_same_store_shipment_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_shipment_id BEFORE INSERT OR UPDATE OF shipment_id, store_id ON public.shipment_events FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('shipment_id', 'shipments');


--
-- Name: orders trg_same_store_shipping_address_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_shipping_address_id BEFORE INSERT OR UPDATE OF shipping_address_id, store_id ON public.orders FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('shipping_address_id', 'shipping_addresses');


--
-- Name: cart_items trg_same_store_user_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_user_id BEFORE INSERT OR UPDATE OF user_id, store_id ON public.cart_items FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('user_id', 'users');


--
-- Name: discuser trg_same_store_user_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_user_id BEFORE INSERT OR UPDATE OF user_id, store_id ON public.discuser FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('user_id', 'users');


--
-- Name: googleuser trg_same_store_user_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_user_id BEFORE INSERT OR UPDATE OF user_id, store_id ON public.googleuser FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('user_id', 'users');


--
-- Name: logintoken trg_same_store_user_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_user_id BEFORE INSERT OR UPDATE OF user_id, store_id ON public.logintoken FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('user_id', 'users');


--
-- Name: notifications trg_same_store_user_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_user_id BEFORE INSERT OR UPDATE OF user_id, store_id ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('user_id', 'users');


--
-- Name: orders trg_same_store_user_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_user_id BEFORE INSERT OR UPDATE OF user_id, store_id ON public.orders FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('user_id', 'users');


--
-- Name: product_questions trg_same_store_user_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_user_id BEFORE INSERT OR UPDATE OF user_id, store_id ON public.product_questions FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('user_id', 'users');


--
-- Name: product_reviews trg_same_store_user_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_user_id BEFORE INSERT OR UPDATE OF user_id, store_id ON public.product_reviews FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('user_id', 'users');


--
-- Name: resellers trg_same_store_user_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_user_id BEFORE INSERT OR UPDATE OF user_id, store_id ON public.resellers FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('user_id', 'users');


--
-- Name: shipping_addresses trg_same_store_user_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_user_id BEFORE INSERT OR UPDATE OF user_id, store_id ON public.shipping_addresses FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('user_id', 'users');


--
-- Name: cart_items trg_same_store_variation_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_variation_id BEFORE INSERT OR UPDATE OF variation_id, store_id ON public.cart_items FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('variation_id', 'product_variations');


--
-- Name: order_items trg_same_store_variation_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_variation_id BEFORE INSERT OR UPDATE OF variation_id, store_id ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('variation_id', 'product_variations');


--
-- Name: stock_keys trg_same_store_variation_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_same_store_variation_id BEFORE INSERT OR UPDATE OF variation_id, store_id ON public.stock_keys FOR EACH ROW EXECUTE FUNCTION public.enforce_same_store('variation_id', 'product_variations');


--
-- Name: categories trg_set_categories_position; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_categories_position BEFORE INSERT ON public.categories FOR EACH ROW EXECUTE FUNCTION public.set_categories_position();


--
-- Name: product_variations trg_set_product_variation_position; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_product_variation_position BEFORE INSERT ON public.product_variations FOR EACH ROW EXECUTE FUNCTION public.set_variations_position();


--
-- Name: products trg_set_product_variation_position; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_product_variation_position BEFORE INSERT ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_products_position();


--
-- Name: products trg_set_products_position; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_products_position BEFORE INSERT ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_products_position();


--
-- Name: admin_roles admin_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_roles
    ADD CONSTRAINT admin_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.team_roles(id) ON DELETE CASCADE;


--
-- Name: admin_roles admin_roles_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_roles
    ADD CONSTRAINT admin_roles_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: admin admin_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin
    ADD CONSTRAINT admin_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: carriers carriers_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.carriers
    ADD CONSTRAINT carriers_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: cart_items cart_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: cart_items cart_items_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: cart_items cart_items_variation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.product_variations(id) ON DELETE SET NULL;


--
-- Name: categories categories_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: chat_conversations chat_conversations_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_conversations
    ADD CONSTRAINT chat_conversations_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: chat_conversations chat_conversations_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_conversations
    ADD CONSTRAINT chat_conversations_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: chat_messages chat_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.chat_conversations(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: chat_typing chat_typing_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_typing
    ADD CONSTRAINT chat_typing_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.chat_conversations(id) ON DELETE CASCADE;


--
-- Name: chat_typing chat_typing_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_typing
    ADD CONSTRAINT chat_typing_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: coupons coupons_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: customer_profiles customer_profiles_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_profiles
    ADD CONSTRAINT customer_profiles_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: customer_profiles customer_profiles_user_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_profiles
    ADD CONSTRAINT customer_profiles_user_fk FOREIGN KEY (store_id, email) REFERENCES public.users(store_id, email) ON DELETE CASCADE;


--
-- Name: delivery_failures delivery_failures_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_failures
    ADD CONSTRAINT delivery_failures_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: delivery_failures delivery_failures_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_failures
    ADD CONSTRAINT delivery_failures_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: discuser discuser_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discuser
    ADD CONSTRAINT discuser_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: discuser discuser_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discuser
    ADD CONSTRAINT discuser_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: email_codes email_codes_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_codes
    ADD CONSTRAINT email_codes_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: email_verification email_verification_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification
    ADD CONSTRAINT email_verification_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: orders fk_orders_shipping_address; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT fk_orders_shipping_address FOREIGN KEY (shipping_address_id) REFERENCES public.shipping_addresses(id) ON DELETE SET NULL;


--
-- Name: wallet_ledger fk_wallet_ledger_withdrawal_request; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_ledger
    ADD CONSTRAINT fk_wallet_ledger_withdrawal_request FOREIGN KEY (withdrawal_request_id) REFERENCES public.withdrawal_requests(id) ON DELETE SET NULL;


--
-- Name: googleuser googleuser_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.googleuser
    ADD CONSTRAINT googleuser_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: googleuser googleuser_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.googleuser
    ADD CONSTRAINT googleuser_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: home_banners home_banners_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.home_banners
    ADD CONSTRAINT home_banners_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: logintoken logintoken_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logintoken
    ADD CONSTRAINT logintoken_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: logintoken logintoken_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logintoken
    ADD CONSTRAINT logintoken_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: melhor_envio_credentials melhor_envio_credentials_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.melhor_envio_credentials
    ADD CONSTRAINT melhor_envio_credentials_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: mercadopago_credentials mercadopago_credentials_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mercadopago_credentials
    ADD CONSTRAINT mercadopago_credentials_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: notifications notifications_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: order_items order_items_variation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.product_variations(id) ON DELETE SET NULL;


--
-- Name: orders orders_coupon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_coupon_id_fkey FOREIGN KEY (coupon_id) REFERENCES public.coupons(id) ON DELETE SET NULL;


--
-- Name: orders orders_reseller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_reseller_id_fkey FOREIGN KEY (reseller_id) REFERENCES public.resellers(id) ON DELETE SET NULL;


--
-- Name: orders orders_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: orders orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: page_views page_views_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.page_views
    ADD CONSTRAINT page_views_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: payment_transactions payment_transactions_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: payment_transactions payment_transactions_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: product_images product_images_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_images
    ADD CONSTRAINT product_images_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_images product_images_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_images
    ADD CONSTRAINT product_images_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: product_question_messages product_question_messages_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_question_messages
    ADD CONSTRAINT product_question_messages_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.product_questions(id) ON DELETE CASCADE;


--
-- Name: product_question_messages product_question_messages_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_question_messages
    ADD CONSTRAINT product_question_messages_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: product_question_messages product_question_messages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_question_messages
    ADD CONSTRAINT product_question_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: product_questions product_questions_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_questions
    ADD CONSTRAINT product_questions_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_questions product_questions_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_questions
    ADD CONSTRAINT product_questions_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: product_questions product_questions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_questions
    ADD CONSTRAINT product_questions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: product_reviews product_reviews_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_reviews product_reviews_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: product_reviews product_reviews_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: product_variations product_variations_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variations
    ADD CONSTRAINT product_variations_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_variations product_variations_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variations
    ADD CONSTRAINT product_variations_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: products products_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;


--
-- Name: products products_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: reseller_commissions reseller_commissions_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reseller_commissions
    ADD CONSTRAINT reseller_commissions_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: reseller_commissions reseller_commissions_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reseller_commissions
    ADD CONSTRAINT reseller_commissions_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE SET NULL;


--
-- Name: reseller_commissions reseller_commissions_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reseller_commissions
    ADD CONSTRAINT reseller_commissions_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: reseller_commissions reseller_commissions_reseller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reseller_commissions
    ADD CONSTRAINT reseller_commissions_reseller_id_fkey FOREIGN KEY (reseller_id) REFERENCES public.resellers(id) ON DELETE CASCADE;


--
-- Name: reseller_commissions reseller_commissions_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reseller_commissions
    ADD CONSTRAINT reseller_commissions_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: reseller_payout_requests reseller_payout_requests_reseller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reseller_payout_requests
    ADD CONSTRAINT reseller_payout_requests_reseller_id_fkey FOREIGN KEY (reseller_id) REFERENCES public.resellers(id) ON DELETE CASCADE;


--
-- Name: reseller_payout_requests reseller_payout_requests_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reseller_payout_requests
    ADD CONSTRAINT reseller_payout_requests_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: reseller_products reseller_products_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reseller_products
    ADD CONSTRAINT reseller_products_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: reseller_products reseller_products_reseller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reseller_products
    ADD CONSTRAINT reseller_products_reseller_id_fkey FOREIGN KEY (reseller_id) REFERENCES public.resellers(id) ON DELETE CASCADE;


--
-- Name: reseller_products reseller_products_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reseller_products
    ADD CONSTRAINT reseller_products_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: resellers resellers_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resellers
    ADD CONSTRAINT resellers_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: resellers resellers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resellers
    ADD CONSTRAINT resellers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: shipment_events shipment_events_shipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_events
    ADD CONSTRAINT shipment_events_shipment_id_fkey FOREIGN KEY (shipment_id) REFERENCES public.shipments(id) ON DELETE CASCADE;


--
-- Name: shipment_events shipment_events_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipment_events
    ADD CONSTRAINT shipment_events_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: shipments shipments_carrier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipments
    ADD CONSTRAINT shipments_carrier_id_fkey FOREIGN KEY (carrier_id) REFERENCES public.carriers(id) ON DELETE SET NULL;


--
-- Name: shipments shipments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipments
    ADD CONSTRAINT shipments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: shipments shipments_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipments
    ADD CONSTRAINT shipments_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: shipping_addresses shipping_addresses_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_addresses
    ADD CONSTRAINT shipping_addresses_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: shipping_addresses shipping_addresses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_addresses
    ADD CONSTRAINT shipping_addresses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: shipping_quotes shipping_quotes_carrier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_quotes
    ADD CONSTRAINT shipping_quotes_carrier_id_fkey FOREIGN KEY (carrier_id) REFERENCES public.carriers(id) ON DELETE SET NULL;


--
-- Name: shipping_quotes shipping_quotes_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_quotes
    ADD CONSTRAINT shipping_quotes_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: shipping_quotes shipping_quotes_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shipping_quotes
    ADD CONSTRAINT shipping_quotes_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: stock_keys stock_keys_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_keys
    ADD CONSTRAINT stock_keys_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: stock_keys stock_keys_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_keys
    ADD CONSTRAINT stock_keys_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: stock_keys stock_keys_variation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_keys
    ADD CONSTRAINT stock_keys_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.product_variations(id) ON DELETE CASCADE;


--
-- Name: stock_movements stock_movements_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: stock_movements stock_movements_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: stock_movements stock_movements_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: stock_movements stock_movements_variation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_variation_id_fkey FOREIGN KEY (variation_id) REFERENCES public.product_variations(id) ON DELETE SET NULL;


--
-- Name: store_promotion_settings store_promotion_settings_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_promotion_settings
    ADD CONSTRAINT store_promotion_settings_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: store_settings store_settings_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.store_settings
    ADD CONSTRAINT store_settings_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: team_audit_log team_audit_log_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_audit_log
    ADD CONSTRAINT team_audit_log_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: team_base_permissions team_base_permissions_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_base_permissions
    ADD CONSTRAINT team_base_permissions_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: team_roles team_roles_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_roles
    ADD CONSTRAINT team_roles_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: users users_store_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;


--
-- Name: wallet_ledger wallet_ledger_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_ledger
    ADD CONSTRAINT wallet_ledger_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: withdrawal_requests withdrawal_requests_processed_by_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_requests
    ADD CONSTRAINT withdrawal_requests_processed_by_admin_id_fkey FOREIGN KEY (processed_by_admin_id) REFERENCES public.admin(id) ON DELETE SET NULL;


--
-- Name: withdrawal_requests withdrawal_requests_processed_by_dev_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_requests
    ADD CONSTRAINT withdrawal_requests_processed_by_dev_id_fkey FOREIGN KEY (processed_by_dev_id) REFERENCES public.dev_users(id) ON DELETE SET NULL;


--
-- Name: withdrawal_requests withdrawal_requests_requested_by_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.withdrawal_requests
    ADD CONSTRAINT withdrawal_requests_requested_by_admin_id_fkey FOREIGN KEY (requested_by_admin_id) REFERENCES public.admin(id) ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--




-- =====================================================================
-- Dados iniciais: loja padrão (id 1) e a linha de configuração dela.
-- =====================================================================
SET search_path = public;

INSERT INTO stores (id, slug, name) VALUES (1, 'principal', 'Loja principal') ON CONFLICT (id) DO NOTHING;
SELECT setval(pg_get_serial_sequence('stores', 'id'), GREATEST(1, (SELECT MAX(id) FROM stores)));

INSERT INTO store_settings (store_id, background_style, primary_color)
SELECT 1, 'lines', '#b700ff'
WHERE NOT EXISTS (SELECT 1 FROM store_settings WHERE store_id = 1);

-- =====================================================================
-- MULTI-TENANT — FASE 2 (NÃO rode antes do código estar pronto!)
--
-- Pré-requisitos (ver checklist no final):
--   * toda query do app já filtra/insere store_id, e as conexões fazem
--     `SET LOCAL app.store_id = <id>` no início de cada request/transação;
--   * o usuário do banco usado pelo app NÃO é superuser nem tem BYPASSRLS
--     (superuser ignora RLS). Rode 2026-09-25_multi_tenant_phase2b_app_role.sql
--     e troque DB_USER/DB_PASSWORD no .env por esse role;
--   * jobs de plataforma (/dev, webhooks que ainda não sabem a loja) usam
--     outro role com BYPASSRLS.
--
-- Efeito: troca o DEFAULT 1 pelo DEFAULT da conexão (app.store_id) — os
-- INSERTs do app continuam sem informar store_id — e liga Row Level Security: sem `app.store_id` definido, a
-- query enxerga ZERO linhas — falha fechada.
--
-- `stores` fica SEM RLS de propósito (é consultada pelo Host antes de
-- existir tenant).
-- =====================================================================

BEGIN;

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public' AND c.column_name = 'store_id' AND c.table_name <> 'stores'
  LOOP
    -- O DEFAULT deixa de ser a loja 1 e passa a ser a loja da conexão
    -- (app.store_id, definido pelo tenantPool). Sem contexto vira NULL e o
    -- INSERT falha (NOT NULL) em vez de cair na loja errada.
    EXECUTE format('ALTER TABLE %I ALTER COLUMN store_id SET DEFAULT NULLIF(current_setting(''app.store_id'', true), '''')::integer', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      $p$CREATE POLICY tenant_isolation ON %I
         USING (store_id = NULLIF(current_setting('app.store_id', true), '')::integer)
         WITH CHECK (store_id = NULLIF(current_setting('app.store_id', true), '')::integer)$p$, t);
  END LOOP;
END $$;

COMMIT;

-- =====================================================================
-- CHECKLIST DE CÓDIGO (o que mudar no app antes desta fase)
-- =====================================================================
-- 1. FEITO — lib/tenant/tenantContext.ts resolve Host -> stores.id (cache 60s);
--    defina ROOT_DOMAIN no .env para ligar o modo multi-loja.
-- 2. FEITO — lib/database/tenantPool.ts: getDB() liga app.store_id em toda conexão.
-- 3. FEITO — JWT com claim `sid` (lib/jwt/storeAware.ts rejeita token de outra
--    loja). Mantenha cookies host-only (sem Domain=.raiz).
-- 4. Todos os ensure*() (team.ts, ensureQuestionsTable, ensureReviewsTable,
--    ensureResellerTables, ensureNotificationsTable, promotionSettings,
--    stockMovements, deliveryFailures, store-settings/route.ts...) criam
--    tabelas SEM store_id: passar a criar com store_id NOT NULL REFERENCES
--    stores(id) e com as UNIQUEs por loja acima — senão recriam o schema errado.
-- 5. Credenciais por loja: Mercado Pago sai do .env para mercadopago_credentials
--    (criptografada, por store_id); webhook precisa achar a loja pelo
--    payment_ref/rota /api/webhooks/mercadopago/<storeId> e validar o segredo
--    daquela loja. Melhor Envio idem. chat_encryption_key sai de store_settings
--    para uma chave por loja.
-- 6. Login social: Google/Discord não aceitam redirect com curinga de
--    subdomínio — usar um domínio central de auth com a loja no `state`.
-- 7. Arquivos: prefixar uploads/private/stock com /<storeId>/ e validar a
--    loja em /api/files.
-- 8. Rate limit, caches em memória e chaves de SSE: incluir store_id na chave.
-- 9. Legado sem uso (não migrado): wallet_ledger, withdrawal_requests, banners.
-- =====================================================================
