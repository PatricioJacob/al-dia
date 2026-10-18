# Genera los íconos de la app: python generar_iconos.py
from PIL import Image, ImageDraw

FONDO = (13, 13, 18)
NARANJA = (255, 107, 74)
VERDE = (94, 214, 150)

def icono(tam, escala_contenido=1.0, redondeado=True):
    S = tam * 4  # dibujar a 4x para bordes suaves
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if redondeado:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.225), fill=FONDO)
    else:
        d.rectangle([0, 0, S, S], fill=FONDO)
    c = S / 2
    r = S * 0.30 * escala_contenido
    g = S * 0.075 * escala_contenido
    d.ellipse([c - r, c - r, c + r, c + r], outline=NARANJA, width=int(g))
    # tilde
    p = [(c - r * 0.45, c + r * 0.02), (c - r * 0.1, c + r * 0.38), (c + r * 0.5, c - r * 0.34)]
    d.line(p, fill=(244, 244, 246), width=int(g * 0.9), joint='curve')
    for x, y in (p[0], p[2]):
        e = g * 0.45
        d.ellipse([x - e, y - e, x + e, y + e], fill=(244, 244, 246))
    # puntito verde (aviso)
    pr = S * 0.055 * escala_contenido
    px, py = c + r * 0.78, c - r * 0.78
    d.ellipse([px - pr * 1.6, py - pr * 1.6, px + pr * 1.6, py + pr * 1.6], fill=FONDO)
    d.ellipse([px - pr, py - pr, px + pr, py + pr], fill=VERDE)
    return img.resize((tam, tam), Image.LANCZOS)

icono(192).save('app/iconos/icono-192.png')
icono(512).save('app/iconos/icono-512.png')
icono(512, 0.78, redondeado=False).save('app/iconos/icono-maskable-512.png')
icono(180, 1.0, redondeado=False).convert('RGB').save('app/iconos/apple-touch-icon.png')
print('Íconos listos en app/iconos/')
