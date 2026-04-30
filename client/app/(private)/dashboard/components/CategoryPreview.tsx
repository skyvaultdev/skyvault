"use client";

import Link from "next/link";
import React, { useState, useEffect } from "react";

export interface Product {
    id: number;
    name: string;
    slug: string;
    price: number;
    image_url?: string;
    category_slug?: string;
    category_name?: string;
}

export interface Category {
    id: number;
    name: string;
    slug: string;
}

interface SectionType {
    category: Category;
    index: number;
}

interface CategoryPreviewProps {
    categories: Category[];
    sections: SectionType[];
    isPreview?: boolean;
}

export default function CategoryPreview({
    categories,
    sections,
    isPreview = false,
}: CategoryPreviewProps) {

    const [localSections, setLocalSections] = useState<SectionType[]>(sections);
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    /*
    useEffect(() => {
        const sortedSections = [...sections].sort((a, b) => a.index - b.index);
        setLocalSections(sortedSections);
    }, [sections]);
    */

    function handleDragStart(e: React.DragEvent, index: number) {
        if (!isPreview) return;
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(index));
        if (e.dataTransfer.setDragImage) {
            e.dataTransfer.setDragImage(new Image(), 0, 0);
        }
    }

    function handleDragOver(e: React.DragEvent, index: number) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragOverIndex !== index) {
            setDragOverIndex(index);
        }
    }

    function handlDragLeave() {
        setDragOverIndex(null);
    }

    function handleDrop(e: React.DragEvent, index: number) {
        e.preventDefault();
        setDragOverIndex(null);

        if (draggedIndex === null || draggedIndex === index) return;

        const newSections = [...localSections];
        const [removed] = newSections.splice(draggedIndex, 1);

        newSections.splice(index, 0, removed);
        setLocalSections(newSections);
        setDraggedIndex(null);

        console.log(`Arrastando ${draggedIndex} para ${index}`);
    }



    const handleDragEnd = () => {
        setDraggedIndex(null);
        setDragOverIndex(null);
    };

    async function saveHomeOrder() {
        setIsSaving(true);

        const payload = localSections.map((section, index) => ({
            id: section.category.id,
            position: index + 1,
        }));

        try {
            const response = await fetch("/api/categories/order", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (response.ok) {
                alert(`✅ Ordem salva! categorias atualizadas.`);
            } else {
                alert("❌ Erro ao salvar.");
            }
        } catch (error) {
            alert("❌ Erro na requisição.");
        } finally {
            setIsSaving(false);
        }
    }

    const DisabledLink = ({ href, className, children }: any) => {
        if (isPreview) {
            return <div className={className} style={{ cursor: 'default' }}>{children}</div>;
        }
        return <Link href={href} className={className}>{children}</Link>;
    };

    return (
        <main className="categoryPreview">
            {isPreview && (
                <div className="savebtnord">
                    <button onClick={saveHomeOrder} disabled={isSaving}>
                        {isSaving ? "Salvando..." : "💾 Salvar Ordem"}
                    </button>
                    <span>🖱️ Arraste as categorias para reordenar</span>
                </div>
            )}

            {localSections.map(({ category, index }, i) => (
                <section key={category.slug} className={`categorySection ${dragOverIndex === index ? 'dragOver' : ''}`}>
                    <div
                        className={`categorySection ${dragOverIndex === index ? 'is-dragging-over' : ''}`}
                        draggable={isPreview}
                        onDragStart={(e) =>
                            handleDragStart(e, i)}
                        onDragOver={(e) =>
                            handleDragOver(e, i)}
                        onDrop={(e) =>
                            handleDrop(e, i)
                        }
                        onDragLeave={() => setDragOverIndex(null)}
                        onDragEnd={handleDragEnd}
                    >
                        <h2 className="categoryTitle">{category.name}</h2>
                    </div>
                    <div className="categoryItemsGrid" onDragOver={(e) =>
                        handleDragOver(e, i)}>
                    </div>
                </section>
            ))}
        </main>
    );
}