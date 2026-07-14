import React, { useState } from 'react';

import {
  Box,
  Button,
  ContentLayout,
  Flex,
  HeaderLayout,
  Layout,
  Main,
  ProgressBar,
  Typography,
} from '@strapi/design-system';
import { useFetchClient, useNotification } from '@strapi/helper-plugin';
import { CloudUpload } from '@strapi/icons';

// Ficheiros grandes enviados de ligações lentas/instáveis nunca completam um
// único POST antes de a ligação ser cortada (~60s). Envia-se por isso em
// pedaços pequenos, cada um curto o suficiente para terminar mesmo em
// ligações fracas, com retry por pedaço. Mesma lógica usada no formulário
// público de candidatura (pnp.cv/components/Inscrever/FileUploadSection.tsx).
const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_CHUNK_RETRIES = 3;

const uploadChunkWithRetry = (post, uploadId, chunkIndex, blob, onChunkProgress) => {
  const attempt = (retriesLeft) => {
    const formData = new FormData();
    formData.append('chunk', blob);

    return post(`/api/chunked-upload/${uploadId}/chunks/${chunkIndex}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: ({ loaded }) => onChunkProgress(loaded),
    }).catch((err) => {
      if (retriesLeft <= 0) throw err;
      onChunkProgress(0);
      return new Promise((resolve) => {
        setTimeout(resolve, 800 * (MAX_CHUNK_RETRIES - retriesLeft + 1));
      }).then(() => attempt(retriesLeft - 1));
    });
  };

  return attempt(MAX_CHUNK_RETRIES);
};

const uploadFileInChunks = async (post, file, onProgress) => {
  const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));

  const { data: initData } = await post('/api/chunked-upload/init', {
    filename: file.name,
    mimetype: file.type || 'application/octet-stream',
    size: file.size,
    totalChunks,
  });
  const { uploadId } = initData;

  let bytesSentBeforeCurrentChunk = 0;
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const blob = file.slice(start, end);

    // eslint-disable-next-line no-await-in-loop
    await uploadChunkWithRetry(post, uploadId, chunkIndex, blob, (loadedInChunk) => {
      const percent = Math.round(
        ((bytesSentBeforeCurrentChunk + loadedInChunk) * 100) / file.size
      );
      onProgress(percent);
    });

    bytesSentBeforeCurrentChunk += end - start;
  }

  const { data: completeData } = await post(`/api/chunked-upload/${uploadId}/complete`, {});
  return completeData;
};

const ChunkedUpload = () => {
  const [files, setFiles] = useState([]);
  const { post } = useFetchClient();
  const toggleNotification = useNotification();

  const updateFile = (index, patch) => {
    setFiles((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const handleFiles = async (fileList) => {
    const selected = Array.from(fileList).map((f) => ({
      name: f.name,
      progress: 0,
      status: 'uploading',
    }));
    const startIndex = files.length;
    setFiles((prev) => [...prev, ...selected]);

    for (let i = 0; i < fileList.length; i += 1) {
      const index = startIndex + i;
      const file = fileList[i];

      try {
        // eslint-disable-next-line no-await-in-loop
        await uploadFileInChunks(post, file, (percent) => updateFile(index, { progress: percent }));
        updateFile(index, { progress: 100, status: 'done' });
      } catch (err) {
        updateFile(index, { status: 'error' });
        toggleNotification({
          type: 'warning',
          message: { id: 'notification.error', defaultMessage: `Falha ao enviar ${file.name}` },
        });
      }
    }
  };

  const onInputChange = (e) => {
    if (e.target.files?.length) handleFiles(e.target.files);
    e.target.value = '';
  };

  return (
    <Layout>
      <Main>
        <HeaderLayout
          title="Upload de Ficheiros Grandes"
          subtitle="Para ficheiros grandes em ligações lentas/instáveis — envia em pedaços pequenos com retry automático. O ficheiro fica disponível na Media Library normal assim que terminar."
        />
        <ContentLayout>
          <Box
            as="label"
            padding={8}
            background="neutral100"
            hasRadius
            borderStyle="dashed"
            borderWidth="1px"
            borderColor="neutral300"
            style={{ display: 'block', cursor: 'pointer', textAlign: 'center' }}
          >
            <Flex direction="column" gap={2} alignItems="center">
              <CloudUpload width="2rem" height="2rem" />
              <Typography variant="omega">Clique para escolher ficheiros ou arraste para aqui</Typography>
            </Flex>
            <input
              type="file"
              multiple
              onChange={onInputChange}
              style={{ display: 'none' }}
            />
          </Box>

          {files.length > 0 && (
            <Box marginTop={6}>
              <Flex direction="column" gap={3} alignItems="stretch">
                {files.map((f, i) => (
                  <Box key={`${f.name}-${i}`} padding={4} background="neutral0" hasRadius borderWidth="1px" borderStyle="solid" borderColor="neutral150">
                    <Flex justifyContent="space-between" marginBottom={2}>
                      <Typography fontWeight="bold">{f.name}</Typography>
                      <Typography textColor={f.status === 'error' ? 'danger600' : 'neutral600'}>
                        {f.status === 'error' ? 'Erro' : f.status === 'done' ? 'Concluído' : `${f.progress}%`}
                      </Typography>
                    </Flex>
                    {f.status !== 'error' && <ProgressBar value={f.progress}>{`${f.progress}/100%`}</ProgressBar>}
                  </Box>
                ))}
              </Flex>
            </Box>
          )}
        </ContentLayout>
      </Main>
    </Layout>
  );
};

export default ChunkedUpload;
