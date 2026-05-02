import {useEffect, useMemo, useState} from 'react';
import {Link, useParams} from 'react-router-dom';

import {getLegalDocument, getLegalDocumentTitle} from '../api/legal';
import styles from '../styles/LegalDocumentPage.module.css';

function LegalText({body}) {
    const blocks = useMemo(() => {
        return String(body || '')
            .split(/\n{2,}/)
            .map((block) => block.trim())
            .filter(Boolean);
    }, [body]);

    return (
        <div className={styles.document}>
            {blocks.map((block, index) => {
                const headingLevel = block.match(/^(#{2,3})\s+(.+)$/);
                if (headingLevel) {
                    const text = headingLevel[2];
                    return headingLevel[1].length === 2
                        ? <h2 key={`${index}-${text}`}>{text}</h2>
                        : <h3 key={`${index}-${text}`}>{text}</h3>;
                }

                const listLines = block.split('\n').filter((line) => /^[-*]\s+/.test(line.trim()));
                if (listLines.length > 0 && listLines.length === block.split('\n').length) {
                    return (
                        <ul key={`list-${index}`}>
                            {listLines.map((line) => (
                                <li key={line}>{line.replace(/^[-*]\s+/, '')}</li>
                            ))}
                        </ul>
                    );
                }

                return block.split('\n').map((line, lineIndex) => (
                    <p key={`p-${index}-${lineIndex}`}>{line}</p>
                ));
            })}
        </div>
    );
}

export default function LegalDocumentPage() {
    const {slug} = useParams();
    const [documentData, setDocumentData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const fallbackTitle = getLegalDocumentTitle(slug);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        setError('');
        setDocumentData(null);

        getLegalDocument(slug)
            .then((data) => {
                if (!alive) return;
                setDocumentData(data);
            })
            .catch((err) => {
                if (!alive) return;
                setError(err?.message || 'Документ временно недоступен');
            })
            .finally(() => {
                if (alive) setLoading(false);
            });

        return () => {
            alive = false;
        };
    }, [slug]);

    return (
        <div className={styles.page}>
            <div className={styles.shell}>
                <nav className={styles.breadcrumbs} aria-label="Навигация">
                    <Link to="/">Главная</Link>
                    <span>/</span>
                    <span>{documentData?.title || fallbackTitle}</span>
                </nav>

                <header className={styles.head}>
                    <h1 className={styles.title}>{documentData?.title || fallbackTitle}</h1>
                    {documentData?.updated_at ? (
                        <div className={styles.updated}>
                            Обновлено: {new Date(documentData.updated_at).toLocaleDateString('ru-RU')}
                        </div>
                    ) : null}
                </header>

                {loading ? (
                    <div className={styles.state}>Загрузка документа...</div>
                ) : error ? (
                    <div className={styles.empty}>
                        <h2>Документ не загружен</h2>
                        <p>
                            Загрузите файл в директорию юридических документов на сервере.
                        </p>
                    </div>
                ) : (
                    <LegalText body={documentData?.body}/>
                )}
            </div>
        </div>
    );
}
