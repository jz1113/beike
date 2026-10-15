import React, { isValidElement, type ReactNode } from 'react';
import type { FolderEntry, FolderItem } from './folderTypes';

export const DocumentCard = ({ title, description }: { title?: string; description?: string }) => (
  <div className="folder-doc">
    {title ? <span className="folder-doc-title">{title}</span> : <span className="folder-doc-heading" />}
    {description && <span className="folder-doc-text">{description}</span>}
    <span className="folder-doc-line" style={{ width: '92%' }} />
    <span className="folder-doc-line" style={{ width: '84%' }} />
    <span className="folder-doc-line" style={{ width: '88%' }} />
    <span className="folder-doc-block" />
    <span className="folder-doc-line" style={{ width: '80%' }} />
    <span className="folder-doc-line" style={{ width: '62%' }} />
  </div>
);

export const renderItem = (item: FolderEntry): ReactNode => {
  if (isValidElement(item)) return item;
  if (typeof item === 'string') {
    if (item.startsWith('http://') || item.startsWith('https://') || item.startsWith('/') || item.startsWith('data:')) {
      return (
        <div className="folder-photo">
          <img src={item} alt="" draggable={false} loading="lazy" />
        </div>
      );
    }
    return <DocumentCard title={item} />;
  }
  if (typeof item === 'number') return <DocumentCard title={String(item)} />;
  if (item && typeof item === 'object') {
    const obj = item as FolderItem;
    if (obj.image) {
      return (
        <div className="folder-photo">
          <img src={obj.image} alt={obj.alt ?? obj.title ?? ''} draggable={false} />
        </div>
      );
    }
    if (obj.content) return obj.content;
    return <DocumentCard title={obj.title} description={obj.description} />;
  }
  return <DocumentCard />;
};
