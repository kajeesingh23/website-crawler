"use server";

import { refresh } from "next/cache";
import * as L from "@/lib/library";

// Everything here is called from the browser, so every argument is checked before use.
const id = (v: unknown) => {
  if (typeof v !== "string" || !/^[0-9a-f-]{32,36}$/i.test(v)) throw new Error("Unknown item.");
  return v;
};
const ids = (v: unknown) => {
  if (!Array.isArray(v) || v.length === 0 || v.length > 500) throw new Error("Select something first.");
  return v.map(id);
};
const text = (v: unknown) => {
  if (typeof v !== "string") throw new Error("Expected text.");
  return v;
};

type Result = { error?: string; id?: string };
const run = async (fn: () => string | void): Promise<Result> => {
  try {
    const out = fn();
    refresh();
    return typeof out === "string" ? { id: out } : {};
  } catch (e) {
    return { error: (e as Error).message };
  }
};

export async function renameItem(itemId: unknown, name: unknown) {
  return run(() => L.updateItem(id(itemId), { name: text(name) }));
}
export async function setNotes(itemId: unknown, notes: unknown) {
  return run(() => L.updateItem(id(itemId), { notes: text(notes) }));
}
export async function setTags(itemId: unknown, tags: unknown) {
  return run(() => L.updateItem(id(itemId), { tags: text(tags).split(",") }));
}
export async function setFavourite(itemId: unknown, on: unknown) {
  return run(() => L.updateItem(id(itemId), { favourite: on === true }));
}
export async function deleteItems(itemIds: unknown) {
  return run(() => L.deleteItems(ids(itemIds)));
}
export async function duplicateItem(itemId: unknown) {
  return run(() => L.duplicateItem(id(itemId)));
}
export async function moveItem(itemId: unknown, targetId: unknown, place: unknown) {
  return run(() => L.moveItem(id(itemId), id(targetId), place === "after" ? "after" : "before"));
}
export async function createCollection(name: unknown) {
  return run(() => L.createCollection(text(name)));
}
export async function renameCollection(collectionId: unknown, name: unknown) {
  return run(() => L.renameCollection(id(collectionId), text(name)));
}
export async function deleteCollection(collectionId: unknown) {
  return run(() => L.deleteCollection(id(collectionId)));
}
export async function addToCollection(collectionId: unknown, itemIds: unknown) {
  return run(() => L.addToCollection(id(collectionId), ids(itemIds)));
}
export async function removeFromCollection(collectionId: unknown, itemIds: unknown) {
  return run(() => L.removeFromCollection(id(collectionId), ids(itemIds)));
}
