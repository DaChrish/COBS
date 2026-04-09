import { Modal, Stack, Group, ActionIcon, Button } from "@mantine/core";
import { IconDownload, IconZoomIn, IconZoomOut, IconZoomReset } from "@tabler/icons-react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { useTranslation } from "react-i18next";

interface Props {
  src: string | null;
  onClose: () => void;
}

export function PhotoViewer({ src, onClose }: Props) {
  const { t } = useTranslation();
  return (
    <Modal opened={src !== null} onClose={onClose}
      fullScreen padding={0} withCloseButton
      styles={{ close: { position: "absolute", top: 12, right: 12, zIndex: 10 }, body: { height: "100%", display: "flex", flexDirection: "column" } }}>
      {src && (
        <TransformWrapper minScale={1} maxScale={5} doubleClick={{ mode: "toggle", step: 2 }} pinch={{ step: 5 }}>
          {({ zoomIn, zoomOut, resetTransform }) => (
            <Stack gap={0} h="100%">
              <div style={{ flex: 1, overflow: "hidden" }}>
                <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }}
                  contentStyle={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <img src={src} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                </TransformComponent>
              </div>
              <Group justify="center" gap="xs" p="sm">
                <ActionIcon variant="light" size="lg" onClick={() => zoomOut()}><IconZoomOut size={18} /></ActionIcon>
                <ActionIcon variant="light" size="lg" onClick={() => resetTransform()}><IconZoomReset size={18} /></ActionIcon>
                <ActionIcon variant="light" size="lg" onClick={() => zoomIn()}><IconZoomIn size={18} /></ActionIcon>
                <Button size="sm" variant="light" leftSection={<IconDownload size={16} />}
                  component="a" href={src} download>
                  {t("common.download")}
                </Button>
              </Group>
            </Stack>
          )}
        </TransformWrapper>
      )}
    </Modal>
  );
}
