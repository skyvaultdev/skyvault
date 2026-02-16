import { NextResponse } from "next/server";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data, error: null }, { status });
}

export function fail(error: string, status = 400) {
  return NextResponse.json({ ok: false, data: null, error }, { status });
}
